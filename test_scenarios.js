const mongoose = require('mongoose');
const Member = require('./src/models/Member');
const Marriage = require('./src/models/Marriage');
require('dotenv').config();

// We need to import or mock the helper functions
// Since they are inside src/routes/members.js, we might have trouble importing them if not exported.
// For testing, I will copy the logic or temporarily export them.

async function testScenario() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        // Cleanup previous test data
        await Member.deleteMany({ firstName: /TestAuto/ });
        await Marriage.deleteMany({});

        // Mock generate functions
        const generateMemberId = async () => 'M' + Math.floor(1000 + Math.random() * 9000);
        const generateFamilyId = async () => 'F' + Math.floor(1000 + Math.random() * 9000);

        // Helper to Map Flat Payload to Optimized Schema (Copy of what is in members.js)
        function mapFlatToOptimized(payload) {
            const clean = (val) => (typeof val === 'string' ? val.trim().replace(/\s+/g, ' ') : val);
            const data = {
                firstName: clean(payload.firstName),
                middleName: clean(payload.middleName),
                lastName: clean(payload.lastName),
                prefix: clean(payload.prefix),
                gender: payload.gender,
                dob: payload.dob,
                lifeStatus: payload.lifeStatus || 'Alive',
                maritalStatus: payload.maritalStatus,
                education: clean(payload.education),
                occupation: clean(payload.occupation),
                photoUrl: payload.photoUrl,
                showOnMatrimony: String(payload.showOnMatrimony) === 'true',
                familyId: payload.familyId,
                isPrimary: String(payload.isPrimary) === 'true',
                maidenName: clean(payload.maidenName),
                lineage_links: payload.lineage_links || {}
            };
            data.contact = {
                mobile: clean(payload.phone || payload.mobile),
                email: clean(payload.email)
            };
            data.geography = {
                city: payload.city,
                village: payload.village
            };
            if (payload.fatherId) data.father = payload.fatherId;
            if (payload.motherId) data.mother = payload.motherId;
            if (payload.spouseId) data.spouse = payload.spouseId;
            return data;
        }

        const allToUpsert = [];
        const marriages = [];

        async function processRecursive(node, context = {}) {
            if (!node) return null;
            const data = mapFlatToOptimized(node);
            data._id = new mongoose.Types.ObjectId();
            data.memberId = await generateMemberId();
            if (context.familyId) data.familyId = context.familyId;
            else data.familyId = await generateFamilyId();
            if (context.father) data.father = context.father;
            if (context.mother) data.mother = context.mother;

            if (node.spouse) {
                const sData = mapFlatToOptimized(node.spouse);
                sData._id = new mongoose.Types.ObjectId();
                sData.memberId = await generateMemberId();
                sData.familyId = data.familyId;
                data.spouse = sData._id;
                sData.spouse = data._id;
                allToUpsert.push(sData);
                marriages.push({
                    husbandId: data.gender === 'Male' ? data._id : sData._id,
                    wifeId: data.gender === 'Female' ? data._id : sData._id,
                    status: 'Active'
                });
            }

            if (node.children && Array.isArray(node.children)) {
                const childIds = [];
                for (const c of node.children) {
                    const cContext = {
                        familyId: data.familyId,
                        father: data.gender === 'Male' ? data._id : null,
                        mother: data.gender === 'Female' ? data._id : null
                    };
                    const savedC = await processRecursive(c, cContext);
                    if (savedC) childIds.push(savedC._id);
                }
                data.children = childIds;
            }
            allToUpsert.push(data);
            return data;
        }

        // COMPLEX PAYLOAD: member -> spouse, child -> child's spouse, grandchild
        const testPayload = {
            member: {
                firstName: 'TestAuto Father', lastName: 'Vishwkarma', gender: 'Male', dob: '1970-01-01',
                spouse: { firstName: 'TestAuto Mother', lastName: 'Vishwkarma', gender: 'Female', dob: '1975-01-01' },
                children: [
                    {
                        firstName: 'TestAuto Son', lastName: 'Vishwkarma', gender: 'Male', dob: '1995-01-01',
                        spouse: { firstName: 'TestAuto DaughterInLaw', lastName: 'Vishwkarma', gender: 'Female', dob: '1997-01-01' },
                        children: [
                            { firstName: 'TestAuto Grandson', lastName: 'Vishwkarma', gender: 'Male', dob: '2020-01-01' }
                        ]
                    }
                ]
            }
        };

        console.log('Processing Recursive Payload...');
        await processRecursive(testPayload.member);

        console.log(`Upserting ${allToUpsert.length} members and ${marriages.length} marriages...`);
        await Member.insertMany(allToUpsert);
        await Marriage.insertMany(marriages);

        // VERIFICATION
        console.log('--- VERIFICATION ---');
        const father = await Member.findOne({ firstName: 'TestAuto Father' });
        const son = await Member.findOne({ firstName: 'TestAuto Son' });
        const grandson = await Member.findOne({ firstName: 'TestAuto Grandson' });
        const dil = await Member.findOne({ firstName: 'TestAuto DaughterInLaw' });

        console.log('Father Spouse Link:', father.spouse ? 'OK' : 'FAIL');
        console.log('Son Father Link:', son.father.equals(father._id) ? 'OK' : 'FAIL');
        console.log('Grandson Father Link:', grandson.father.equals(son._id) ? 'OK' : 'FAIL');
        console.log('Son Spouse Link:', son.spouse.equals(dil._id) ? 'OK' : 'FAIL');
        
        const sonMarriage = await Marriage.findOne({ husbandId: son._id, wifeId: dil._id });
        console.log('Son Marriage Record:', sonMarriage ? 'OK' : 'FAIL');

        console.log('Test Scenario Completed.');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

testScenario();
