const mongoose = require('mongoose');
const Member = require('./src/models/Member');
require('dotenv').config();

async function fixFamilyIds() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        // 1. Find members with invalid familyId
        const invalidMembers = await Member.find({ 
            familyId: { $in: ['Unassigned', 'FNew', '', null] } 
        }).select('_id firstName lastName memberId familyId father spouse');

        console.log(`Found ${invalidMembers.length} members with invalid familyId`);

        let updatedCount = 0;
        let generatedFamilyIdCounter = Math.floor(Date.now() / 1000); // Simple timestamp based base

        function getNextFamilyId() {
            generatedFamilyIdCounter++;
            return `F${generatedFamilyIdCounter}`;
        }

        // Cache for finding relations
        const memberMap = new Map(); // _id -> member
        const allMembers = await Member.find().select('_id firstName lastName memberId familyId father spouse');
        allMembers.forEach(m => memberMap.set(m._id.toString(), m));

        for (const m of invalidMembers) {
            let newFamilyId = null;

            // Strategy 1: Inherit from Father
            if (m.father) {
                const father = memberMap.get(m.father.toString());
                if (father && father.familyId && father.familyId !== 'Unassigned' && father.familyId !== 'FNew') {
                    newFamilyId = father.familyId;
                    console.log(`Inheriting from Father (${father.firstName}): ${m.firstName} -> ${newFamilyId}`);
                }
            }

            // Strategy 2: Inherit from Spouse
            if (!newFamilyId && m.spouse) {
                const spouse = memberMap.get(m.spouse.toString());
                if (spouse && spouse.familyId && spouse.familyId !== 'Unassigned' && spouse.familyId !== 'FNew') {
                    newFamilyId = spouse.familyId;
                    console.log(`Inheriting from Spouse (${spouse.firstName}): ${m.firstName} -> ${newFamilyId}`);
                }
            }

            // Strategy 3: Generate New
            if (!newFamilyId) {
                // If they are "Durgesh Wagh", we know they are supposed to be with "Bhaidas" (F41265591)
                // But generally, generate new.
                
                // Hardcode fix for Durgesh based on inspection
                if (m.firstName === 'दुर्गेश' || m.memberId === 'M41282983') {
                     // Check if father Bhaidas exists
                     // Bhaidas ID from inspection: M41265532, familyId: F41265591
                     const bhaidas = allMembers.find(x => x.memberId === 'M41265532');
                     if (bhaidas) {
                         newFamilyId = bhaidas.familyId;
                         console.log(`Hardcode logic for Durgesh -> ${newFamilyId}`);
                     }
                }
                
                if (!newFamilyId) {
                    newFamilyId = getNextFamilyId();
                    console.log(`Generating NEW for ${m.firstName}: ${newFamilyId}`);
                }
            }

            // Apply Update
            if (newFamilyId) {
                await Member.updateOne({ _id: m._id }, { $set: { familyId: newFamilyId } });
                // Update local map for subsequent lookups in this loop (if order matters)
                m.familyId = newFamilyId; 
                memberMap.set(m._id.toString(), m); 
                updatedCount++;
            }
        }

        console.log(`Updated ${updatedCount} members`);

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

fixFamilyIds();
