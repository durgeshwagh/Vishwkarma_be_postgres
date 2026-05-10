const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const cacheService = require('../services/cache.service');
const { Member, Marriage, User } = require('../models');
const { verifyToken, checkPermission } = require('../middleware/authMiddleware');
const { upload } = require('../config/cloudinary');
const { Op } = require('sequelize');
const sequelize = require('../config/database');
const router = express.Router();



/**
 * @swagger
 * components:
 *   schemas:
 *     Member:
 *       type: object
 *       required:
 *         - firstName
 *         - lastName
 *         - gender
 *         - maritalStatus
 *       properties:
 *         id:
 *           type: string
 *           description: The auto-generated id of the member
 *         firstName:
 *           type: string
 *           description: The first name of the member
 *         lastName:
 *           type: string
 *           description: The last name of the member
 *         gender:
 *           type: string
 *           enum: [Male, Female]
 *         maritalStatus:
 *           type: string
 *           enum: [Single, Married, Divorced, Widowed]
 *         maidenName:
 *           type: string
 *           description: The maiden name of the member (for married women)
 *         memberId:
 *           type: string
 *           description: Custom generated member ID (e.g. M123456)
 *         familyId:
 *           type: string
 *           description: The family ID this member belongs to
 *       example:
 *         firstName: John
 *         lastName: Doe
 *         gender: Male
 *         maritalStatus: Single
 */

// Multer Configuration imported from ../config/cloudinary.js

// Wrapper to handle Multer errors
const uploadMiddleware = (fields) => (req, res, next) => {
    console.log(`[UploadMiddleware] Starting upload for fields: ${JSON.stringify(fields)}`);
    const uploadStep = upload.fields(fields);
    uploadStep(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            // A Multer error occurred when uploading.
            console.error('[Multer Error]', err);
            return res.status(400).json({ message: 'File Upload Error: ' + err.message, code: err.code });
        } else if (err) {
            // An unknown error occurred when uploading.
            console.error('[Upload Error]', err);
            return res.status(500).json({ message: 'Unknown Upload Error: ' + err.message });
        }
        console.log('[UploadMiddleware] Upload successful or no files.');
        // Everything went fine.
        next();
    });
};

/**
 * @swagger
 * /api/members:
 *   get:
 *     summary: Returns the list of all members
 *     tags: [Members]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name, occupation, city, etc.
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: The list of members
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Member'
 */
router.get('/', verifyToken, checkPermission('member.view'), async (req, res) => {
    try {
        const { search, familyId, isPrimary, showDeceased, gender, maritalStatus, name, location, contact, state, district, city, village } = req.query;
        
        const page = parseInt(req.query.page) || 1;
        const limitParam = req.query.limit;
        const limit = limitParam === '0' ? null : (parseInt(limitParam) || 20);

        let where = {};
        const andConditions = [];
        
        // 1. Life Status Filter
        if (!showDeceased || showDeceased.toString().toLowerCase() !== 'true') {
            andConditions.push({ lifeStatus: 'Alive' });
            andConditions.push({ prefix: { [Op.notIn]: ['स्व.', 'Late', 'Late.', 'Swa'] } });
        }

        // 2. Explicit Filters
        if (isPrimary && isPrimary.toString().toLowerCase().trim() === 'true') where.isPrimary = true;
        if (req.query.showOnMatrimony === 'true') where.showOnMatrimony = true;
        if (gender) where.gender = gender.trim();
        if (maritalStatus) where.maritalStatus = maritalStatus.trim();
        if (familyId) where.familyId = familyId;
        if (req.query.fatherId) where.father_id = req.query.fatherId;
        if (req.query.motherId) where.mother_id = req.query.motherId;

        // 3. Search Query
        if (search && search.trim()) {
            const trimmedSearch = search.trim();
            if (/^M\d+$/i.test(trimmedSearch)) {
                andConditions.push({ memberId: { [Op.iLike]: `%${trimmedSearch}%` } });
            } else {
                andConditions.push({
                    [Op.or]: [
                        { fullName: { [Op.iLike]: `%${trimmedSearch}%` } },
                        { firstName: { [Op.iLike]: `%${trimmedSearch}%` } },
                        { lastName: { [Op.iLike]: `%${trimmedSearch}%` } },
                        { city: { [Op.iLike]: `%${trimmedSearch}%` } },
                        { village: { [Op.iLike]: `%${trimmedSearch}%` } }
                    ]
                });
            }
        }

        // 4. Granular location filters
        if (state) andConditions.push({ [Op.or]: [{ state: { [Op.iLike]: `%${state}%` } }, { geography: { state: { [Op.iLike]: `%${state}%` } } }] });
        if (district) andConditions.push({ [Op.or]: [{ district: { [Op.iLike]: `%${district}%` } }, { geography: { district: { [Op.iLike]: `%${district}%` } } }] });
        if (city) andConditions.push({ [Op.or]: [{ city: { [Op.iLike]: `%${city}%` } }, { taluka: { [Op.iLike]: `%${city}%` } }, { geography: { taluka: { [Op.iLike]: `%${city}%` } } }] });
        if (village) andConditions.push({ [Op.or]: [{ village: { [Op.iLike]: `%${village}%` } }, { geography: { village: { [Op.iLike]: `%${village}%` } } }] });

        if (andConditions.length > 0) where[Op.and] = andConditions;

        // Sorting
        const { sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
        const order = [[sortBy, sortOrder.toUpperCase()]];

        // Execute Pagination
        const { count, rows: rawMembers } = await Member.findAndCountAll({
            where,
            order,
            limit: limit,
            offset: limit ? (page - 1) * limit : 0,
            raw: true
        });

        // Map to include virtuals/compatibility fields
        const members = rawMembers.map(m => {
            let contactObj = {};
            let geoObj = {};
            try { contactObj = typeof m.contact === 'string' ? JSON.parse(m.contact) : (m.contact || {}); } catch(e){}
            try { geoObj = typeof m.geography === 'string' ? JSON.parse(m.geography) : (m.geography || {}); } catch(e){}
            
            return {
                ...m,
                id: m.id,
                _id: m.id, // Backward compatibility for frontend
                fatherId: m.fatherId || m.father_id,
                motherId: m.motherId || m.mother_id,
                spouseId: m.spouseId || m.spouse,
                mobile: contactObj.mobile || contactObj.phone || null,
                phone: contactObj.phone || contactObj.mobile || null,
                email: contactObj.email || null,
                // Assign geography shortcuts cleanly ensuring they don't overwrite with undefined
                state: geoObj.state || m.state,
                district: geoObj.district || m.district,
                taluka: geoObj.taluka || m.taluka,
                village: geoObj.village || m.village,
                age: m.dob ? Math.floor((Date.now() - new Date(m.dob)) / (31557600000)) : null,
                isRegistered: !!m.userId
            };
        });

        res.json({
            data: members,
            pagination: {
                total: count,
                page: page,
                limit: limit || count,
                pages: limit ? Math.ceil(count / limit) : 1
            }
        });
    } catch (err) {
        console.error('[GET /members] Error:', err);
        res.status(500).json({ error: err.message });
    }
});


/**
 * @swagger
 * /api/members/{id}:
 *   get:
 *     summary: Get member by ID
 *     tags: [Members]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Member details
 *       404:
 *         description: Member not found
 */
router.get('/:id', verifyToken, checkPermission('member.view'), async (req, res) => {
    try {
        const idParam = req.params.id;
        if (idParam === 'undefined' || idParam === 'null') return res.status(400).json({ message: 'Invalid ID' });
        
        let member;

        if (idParam.startsWith('M')) {
            member = await Member.findOne({ where: { memberId: idParam } });
        } else {
            member = await Member.findByPk(idParam);
        }

        if (!member) return res.status(404).json({ message: 'Member not found' });
        
        // Serialize explicitly with mapped fields for frontend compatibility
        const plain = member.get ? member.get({ plain: true }) : member;
        plain._id = plain.id;
        
        // Flatten contact fields
        let cObj = {};
        try { cObj = typeof plain.contact === 'string' ? JSON.parse(plain.contact) : (plain.contact || {}); } catch(e){}
        plain.phone = cObj.phone || cObj.mobile || null;
        plain.mobile = cObj.mobile || cObj.phone || null;
        plain.email = cObj.email || null;

        // Flatten geography fields
        let gObj = {};
        try { gObj = typeof plain.geography === 'string' ? JSON.parse(plain.geography) : (plain.geography || {}); } catch(e){}
        plain.stateName = gObj.stateName;
        plain.districtName = gObj.districtName;
        plain.talukaName = gObj.talukaName;
        plain.villageName = gObj.villageName;
        plain.address = gObj.full_address || plain.address;

        res.json(plain);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/:id/edit-profile', verifyToken, checkPermission('member.view'), async (req, res) => {
    try {
        const idParam = req.params.id;
        if (idParam === 'undefined' || idParam === 'null') return res.status(400).json({ message: 'Invalid ID' });

        let member;

        if (idParam.startsWith('M')) {
            member = await Member.findOne({ where: { memberId: idParam } });
        } else {
            member = await Member.findByPk(idParam);
        }

        if (!member) return res.status(404).json({ message: 'Member not found' });

        let spouse = null;
        if (member.spouseId) {
            spouse = await Member.findByPk(member.spouseId);
        }

        res.json({ member, spouse });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/:id/profile-optimized', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        if (id === 'undefined' || id === 'null') return res.status(400).json({ message: 'Invalid ID' });
        
        let member;
        
        if (id.startsWith('M')) {
            member = await Member.findOne({ where: { memberId: id }, raw: true });
        } else {
            member = await Member.findByPk(id, { raw: true });
        }

        if (!member) return res.status(404).json({ message: 'Member not found' });

        const attributes = [
            'id', 'firstName', 'middleName', 'lastName', 'fullName',
            'photoUrl', 'gender', 'dob', 'memberId', 'lifeStatus',
            'education', 'occupation', 'occupationType',
            'state', 'district', 'taluka', 'village', 'geography',
            'contact', 'maritalStatus', 'fatherId', 'motherId', 'spouseId'
        ];

        const family = {
            spouse: null,
            children: [],
            father: null,
            mother: null,
            siblings: [],
            grandchildren: []
        };

        const lookups = [];

        // Spouse
        if (member.spouseId || member.spouse) {
            const sId = member.spouseId || member.spouse;
            lookups.push(Member.findByPk(sId, { attributes, raw: true }).then(m => family.spouse = m));
        }

        // Parents
        if (member.fatherId || member.father_id) {
            const fId = member.fatherId || member.father_id;
            lookups.push(Member.findByPk(fId, { attributes, raw: true }).then(m => family.father = m));
        }
        if (member.motherId || member.mother_id) {
            const mId = member.motherId || member.mother_id;
            lookups.push(Member.findByPk(mId, { attributes, raw: true }).then(m => family.mother = m));
        }

        // Children
        const childOrConditions = [
            { fatherId: member.id },
            { motherId: member.id }
        ];
        if (member.memberId) {
            childOrConditions.push({ fatherMemberId: member.memberId });
            childOrConditions.push({ motherMemberId: member.memberId });
        }
        const sId = member.spouseId || member.spouse;
        if (sId) {
            childOrConditions.push({ fatherId: sId });
            childOrConditions.push({ motherId: sId });
        }

        lookups.push(Member.findAll({
            where: { [Op.or]: childOrConditions },
            attributes,
            raw: true
        }).then(m => family.children = m));

        // Siblings
        const fatherId = member.fatherId || member.father_id;
        const motherId = member.motherId || member.mother_id;
        if (fatherId || motherId) {
            const sibWhere = { id: { [Op.ne]: member.id }, [Op.or]: [] };
            if (fatherId) sibWhere[Op.or].push({ fatherId });
            if (motherId) sibWhere[Op.or].push({ motherId });
            lookups.push(Member.findAll({ where: sibWhere, attributes, raw: true }).then(m => family.siblings = m));
        }

        await Promise.all(lookups);

        // Grandchildren
        if (family.children.length > 0) {
            const childIds = family.children.map(c => c.id);
            family.grandchildren = await Member.findAll({
                where: {
                    [Op.or]: [
                        { fatherId: { [Op.in]: childIds } },
                        { motherId: { [Op.in]: childIds } }
                    ]
                },
                attributes,
                raw: true
            });
        }

        const flatten = (m) => {
            if (!m) return null;
            const res = { 
                ...m, 
                id: m.id,
                _id: m.id, // Backward compatibility
                fatherId: m.fatherId || m.father_id,
                motherId: m.motherId || m.mother_id,
                spouseId: m.spouseId || m.spouse
            };
            if (m.contact) {
                let c;
                try { c = typeof m.contact === 'string' ? JSON.parse(m.contact) : m.contact; } catch(e) {}
                if (c) {
                    res.mobile = c.mobile || c.phone;
                    res.email = c.email;
                    res.whatsapp = c.whatsapp;
                    res.phone = c.phone || c.mobile;
                }
            }
            if (m.geography) {
                let g;
                try { g = typeof m.geography === 'string' ? JSON.parse(m.geography) : m.geography; } catch(e) {}
                if (g) {
                    res.address = g.full_address || m.address;
                    res.state = g.state || m.state;
                    res.district = g.district || m.district;
                    res.taluka = g.taluka || m.taluka;
                    res.village = g.village || m.village;
                    res.pincode = g.pincode || m.pincode;
                }
            }
            // Double fallback if geography was completely missing
            res.state = res.state || m.state;
            res.district = res.district || m.district;
            res.taluka = res.taluka || m.taluka;
            res.village = res.village || m.village;
            res.address = res.address || m.address;
            res.pincode = res.pincode || m.pincode;
            return res;
        };

        res.json({
            member: flatten(member),
            family: {
                spouse: flatten(family.spouse),
                father: flatten(family.father),
                mother: flatten(family.mother),
                children: family.children.map(flatten),
                siblings: family.siblings.map(flatten),
                grandchildren: family.grandchildren.map(flatten)
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @swagger
 * /api/members/bulk-save:
 *   put:
 *     summary: Bulk update a family branch (Alias for POST)
 *     tags: [Members]
 *     security:
 *       - bearerAuth: []
 */
router.put('/bulk-save', verifyToken, checkPermission('member.update'), upload.any(), handleBulkSave);

/**
 * @swagger
 * /api/members/bulk-save:
 *   post:
 *     summary: Bulk save/create a family branch
 *     tags: [Members]
 *     security:
 *       - bearerAuth: []
 */
router.post('/bulk-save', verifyToken, checkPermission('member.create'), upload.any(), handleBulkSave);

/**
 * @swagger
 * /api/members/bulk-delete:
 *   post:
 *     summary: Bulk delete members (SuperAdmin only)
 *     tags: [Members]
 *     security:
 *       - bearerAuth: []
 */
router.post('/bulk-delete', verifyToken, async (req, res) => {
    try {
        // Strict Role Check - SuperAdmin Only
        if (req.user.role !== 'SuperAdmin') {
            return res.status(403).json({ message: 'Access Denied: Only SuperAdmin can perform bulk deletions.' });
        }

        const { ids } = req.body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ message: 'No members selected for deletion' });
        }

        const deletedCount = await Member.destroy({ where: { id: ids } });

        res.json({ 
            message: `${deletedCount} members deleted successfully`, 
            deletedCount: deletedCount,
            ids 
        });
    } catch (err) {
        console.error('[Batch Delete Error]', err);
        res.status(500).json({ error: err.message });
    }
});

// INTERNAL HANDLER FOR BOTH PUT AND POST
async function handleBulkSave(req, res) {
    const t = await sequelize.transaction();

    try {
        let payload = req.body;
        
        if (req.body.data) {
            try {
                payload = JSON.parse(req.body.data);
            } catch (e) {
                console.error('Failed to parse req.body.data JSON:', e);
                await t.rollback();
                return res.status(400).json({ message: 'Invalid JSON data in form payload' });
            }
        }

        // Security checks (skipped for brevity here, should be ported similarly)
        // ... (Refer to original for full security logic) ...

        // MAP UPLOADED FILES TO PAYLOAD
        if (req.files && req.files.length > 0) {
            req.files.forEach(file => {
                const url = file.path;
                const publicId = file.filename;
                const fieldName = file.fieldname;

                if (fieldName === 'member_photo') {
                    if (payload.member) { payload.member.photoUrl = url; payload.member.photoId = publicId; }
                } else if (fieldName === 'spouse_photo') {
                    if (payload.member && payload.member.spouse) {
                        if (typeof payload.member.spouse === 'string') {
                            try { payload.member.spouse = JSON.parse(payload.member.spouse); } catch(e){}
                        }
                        payload.member.spouse.photoUrl = url;
                        payload.member.spouse.photoId = publicId;
                    }
                } else if (fieldName.startsWith('child_')) {
                    const match = fieldName.match(/^child_(\d+)_photo$/);
                    if (match && payload.member.children?.[parseInt(match[1])]) {
                        payload.member.children[match[1]].photoUrl = url;
                        payload.member.children[match[1]].photoId = publicId;
                    }
                }
                // ... handle other file mappings ...
            });
        }

        const allToUpsert = [];
        const marriages = [];

        // Pre-fetch counters
        const lastMember = await Member.findOne({ 
            where: { memberId: { [Op.iLike]: 'M%' } }, 
            order: [['memberId', 'DESC']],
            transaction: t
        });
        let memberIdCounter = lastMember ? parseInt(lastMember.memberId.substring(1)) : 0;

        const lastFamily = await Member.findOne({ 
            where: { familyId: { [Op.iLike]: 'F%' } }, 
            order: [['familyId', 'DESC']],
            transaction: t
        });
        let familyIdCounter = lastFamily ? parseInt(lastFamily.familyId.substring(1)) : 0;
        let generatedFamilyId = null;

        function getNextMemberId() {
            memberIdCounter++;
            return `M${memberIdCounter.toString().padStart(4, '0')}`;
        }

        function getNextFamilyId() {
            familyIdCounter++;
            return `F${familyIdCounter.toString().padStart(4, '0')}`;
        }

        async function processRecursive(node, context = {}) {
            if (!node) return null;
            
            const data = mapFlatToOptimized(node);
            const rawId = node.id || node._id;
            if (!data.id && rawId && rawId.trim() !== "") data.id = rawId.trim();
            if (!data.id) data.id = crypto.randomUUID(); 

            if (!data.memberId) data.memberId = getNextMemberId();

            // Geography Inheritance
            if (context.geography) {
                if (!data.geography) data.geography = {};
                ['state', 'district', 'taluka', 'village', 'full_address', 'pincode'].forEach(f => {
                    if (!data.geography[f] && context.geography[f]) data.geography[f] = context.geography[f];
                });
            }

            // Location Flat Inheritance
            ['state', 'district', 'taluka', 'village'].forEach(f => {
                if (!data[f] && context[f]) data[f] = context[f];
            });
            
            // Family Context
            if (context.familyId && !['FNew', 'Unassigned'].includes(context.familyId)) {
                data.familyId = context.familyId;
            } else if (!data.familyId || ['FNew', 'Unassigned'].includes(data.familyId)) {
                if (!generatedFamilyId) generatedFamilyId = getNextFamilyId();
                data.familyId = generatedFamilyId;
            }
            
            if (context.fatherId) data.fatherId = context.fatherId;
            if (context.motherId) data.motherId = context.motherId;
            if (context.fatherMemberId) data.fatherMemberId = context.fatherMemberId;
            if (context.motherMemberId) data.motherMemberId = context.motherMemberId;

            // Handle Spouse
            if (node.spouse) {
                const sData = mapFlatToOptimized(node.spouse);
                const rawSpouseId = node.spouse.id || node.spouse._id;
                if (!sData.id && rawSpouseId && rawSpouseId.trim() !== "") sData.id = rawSpouseId.trim();
                if (!sData.id) sData.id = crypto.randomUUID();

                if (!sData.memberId) sData.memberId = getNextMemberId();
                
                sData.familyId = data.familyId;
                sData.spouseId = data.id;
                data.spouseId = sData.id;
                
                sData.spouseMemberId = data.memberId;
                data.spouseMemberId = sData.memberId;

                // Inherit Location to Spouse
                ['state', 'district', 'taluka', 'village'].forEach(f => {
                    if (!sData[f] && data[f]) sData[f] = data[f];
                });

                allToUpsert.push(sData);
                marriages.push({
                    husbandId: data.gender === 'Male' ? data.id : sData.id,
                    wifeId: data.gender === 'Female' ? data.id : sData.id,
                    status: 'Active'
                });
            }

            // Handle Children
            if (node.children && Array.isArray(node.children)) {
                let fId = data.gender === 'Male' ? data.id : (context.fatherId || null);
                let mId = data.gender === 'Female' ? data.id : (context.motherId || null);
                let fMId = data.gender === 'Male' ? data.memberId : (context.fatherMemberId || null);
                let mMId = data.gender === 'Female' ? data.memberId : (context.motherMemberId || null);
                
                if (node.spouse) {
                    const sId = node.spouse.id || node.spouse._id;
                    if (data.gender === 'Male') {
                        mId = sId;
                        mMId = node.spouse.memberId;
                    } else {
                        fId = sId;
                        fMId = node.spouse.memberId;
                    }
                }

                for (const c of node.children) {
                    await processRecursive(c, {
                        familyId: data.familyId,
                        fatherId: fId,
                        motherId: mId,
                        fatherMemberId: fMId,
                        motherMemberId: mMId,
                        geography: data.geography,
                        state: data.state,
                        district: data.district,
                        taluka: data.taluka,
                        village: data.village
                    });
                }
            }

            allToUpsert.push(data);
            return data;
        }

        const initialFamilyId = (payload.member.familyId && !['FNew', 'Unassigned'].includes(payload.member.familyId)) 
            ? payload.member.familyId : null;
            
        await processRecursive(payload.member, { familyId: initialFamilyId });

        // Bulk Upsert using Sequelize
        // We do this individually in loop or Promise.all to handle UUID generation if needed
        // but since we have IDs, we can use bulkCreate with updateOnDuplicate or individual upserts.
        // Pass 1: Create members without foreign keys to avoid constraint violations
        for (const m of allToUpsert) {
            const { spouseId, fatherId, motherId, ...basicData } = m;
            await Member.upsert(basicData, { transaction: t });
        }

        // Pass 2: Update members with foreign keys now that all records exist
        for (const m of allToUpsert) {
            await Member.upsert(m, { transaction: t });
        }

        // Marriages
        for (const m of marriages) {
            await Marriage.upsert(m, { transaction: t });
        }

        await t.commit();
        
        const mainMember = allToUpsert.find(m => m.memberId === payload.member.memberId) || allToUpsert[allToUpsert.length - 1];

        res.status(200).json({ 
            message: 'Family branch saved successfully', 
            familyId: mainMember.familyId,
            id: mainMember.id,
            memberId: mainMember.memberId,
            spouseId: mainMember.spouseId || mainMember.spouse,
            spouseMemberId: mainMember.spouseMemberId,
            savedCount: allToUpsert.length
        });
    } catch (err) {
        if (t) await t.rollback();
        console.error('[ERROR] /members/bulk-save:', err);
        res.status(500).json({ error: err.message });
    }
}

async function upsertMemberRecursive(memberData, context = {}, transaction = null) {
    try {
        const data = mapFlatToOptimized({ ...memberData });
        
        if (context.familyId) data.familyId = context.familyId;
        if (context.fatherId) data.fatherId = context.fatherId;
        if (context.motherId) data.motherId = context.motherId;

        const [savedMember] = await Member.upsert(data, { transaction, returning: true });

        // Handle Spouse
        if (memberData.spouse) {
            let spouseData = typeof memberData.spouse === 'string' ? JSON.parse(memberData.spouse) : memberData.spouse;
            spouseData = mapFlatToOptimized(spouseData);
            spouseData.familyId = savedMember.familyId;
            spouseData.spouseId = savedMember.id;
            
            const [savedSpouse] = await Member.upsert(spouseData, { transaction, returning: true });

            if (savedSpouse) {
                await Marriage.upsert({
                    husbandId: savedMember.gender === 'Male' ? savedMember.id : savedSpouse.id,
                    wifeId: savedMember.gender === 'Female' ? savedMember.id : savedSpouse.id,
                    status: 'Active'
                }, { transaction });

                savedMember.spouseId = savedSpouse.id;
                await savedMember.save({ transaction });
            }
        }

        // Children
        if (memberData.children) {
            const childrenData = typeof memberData.children === 'string' ? JSON.parse(memberData.children) : memberData.children;
            if (Array.isArray(childrenData)) {
                for (const child of childrenData) {
                    await upsertMemberRecursive(child, {
                        familyId: savedMember.familyId,
                        fatherId: savedMember.gender === 'Male' ? savedMember.id : (context.fatherId || null),
                        motherId: savedMember.gender === 'Female' ? savedMember.id : (context.motherId || null),
                    }, transaction);
                }
            }
        }
        return savedMember;
    } catch (err) {
        console.error("Recursive Upsert Error:", err);
        throw err;
    }
}

function mapFlatToOptimized(payload) {
    const clean = (val) => (typeof val === 'string' ? val.trim().replace(/\s+/g, ' ') : val);
    const cleanUUID = (val) => (val && typeof val === 'string' && val.trim() !== "" ? val.trim() : null);
    
    const data = {
        id: cleanUUID(payload.id || payload._id),
        memberId: clean(payload.memberId),
        firstName: clean(payload.firstName),
        middleName: clean(payload.middleName),
        lastName: clean(payload.lastName),
        prefix: clean(payload.prefix),
        gender: payload.gender,
        dob: payload.dob ? new Date(payload.dob) : null,
        lifeStatus: payload.lifeStatus || 'Alive',
        maritalStatus: payload.maritalStatus,
        education: clean(payload.education),
        occupation: clean(payload.occupation),
        occupationType: payload.occupationType,
        jobType: payload.jobType,
        photoUrl: payload.photoUrl,
        photoId: payload.photoId,
        showOnMatrimony: String(payload.showOnMatrimony) === 'true',
        bloodGroup: payload.bloodGroup || payload.blood_group,
        height: clean(payload.height),
        hobbies: Array.isArray(payload.hobbies) ? payload.hobbies : (payload.hobbies ? [payload.hobbies] : []),
        familyId: payload.familyId,
        isPrimary: String(payload.isPrimary) === 'true',
        maidenName: clean(payload.maidenName),
        
        contact: {
            mobile: clean(payload.phone || payload.mobile),
            email: clean(payload.email),
            whatsapp: clean(payload.whatsapp)
        },
        geography: {
            pincode: payload.pincode,
            state: payload.state,
            district: payload.district,
            taluka: payload.city || payload.taluka,
            village: payload.village,
            full_address: clean(payload.address)
        },
        fatherId: cleanUUID(payload.fatherId),
        motherId: cleanUUID(payload.motherId),
        spouseId: cleanUUID(payload.spouseId)
    };

    if (data.firstName && data.lastName) {
        const p = data.prefix ? data.prefix + ' ' : '';
        const m = data.middleName ? data.middleName + ' ' : '';
        data.fullName = `${p}${data.firstName} ${m}${data.lastName}`.replace(/\s+/g, ' ').trim();
    }

    return data;
}

/**
 * @swagger
 * /api/members:
 *   post:
 *     summary: Create a new member
 *     tags: [Members]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             $ref: '#/components/schemas/Member'
 *     responses:
 *       201:
 *         description: The member was successfully created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Member'
 *       500:
 *         description: Some server error
 */
/**
 * @swagger
 * /api/members:
 *   post:
 *     summary: Create a new member
 *     tags: [Members]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             $ref: '#/components/schemas/Member'
 *     responses:
 *       201:
 *         description: Member created
 */
// Create New Member
router.post('/', verifyToken, checkPermission('member.create'), upload.any(), handleBulkSave);

// Update Member
router.put('/:id', verifyToken, checkPermission('member.edit'), upload.any(), handleBulkSave);

// Delete Member
router.delete('/:id', verifyToken, checkPermission('member.delete'), async (req, res) => {
    try {
        const member = await Member.findByPk(req.params.id);
        if (!member) return res.status(404).json({ message: 'Member not found' });
        await member.destroy();
        res.json({ message: 'Member deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Batch Delete
router.post('/batch-delete', verifyToken, checkPermission('member.delete'), async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids)) return res.status(400).json({ message: 'IDs must be an array' });
        const result = await Member.destroy({ where: { id: { [Op.in]: ids } } });
        res.json({ message: `${result} members deleted successfully`, deletedCount: result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create Birth Family
router.post('/:id/create-family', verifyToken, checkPermission('member.edit'), async (req, res) => {
    try {
        const member = await Member.findByPk(req.params.id);
        if (!member) return res.status(404).json({ message: 'Member not found' });

        const lastFamily = await Member.findOne({ 
            where: { familyId: { [Op.iLike]: 'F%' } }, 
            order: [['familyId', 'DESC']]
        });
        const num = lastFamily ? parseInt(lastFamily.familyId.substring(1)) + 1 : 1;
        const newFamilyId = `F${num.toString().padStart(4, '0')}`;

        member.familyId = newFamilyId;
        member.isPrimary = true;
        await member.save();

        if (member.gender === 'Male') {
            await Member.update({ familyId: newFamilyId }, { where: { fatherId: member.id } });
        }

        res.json({ message: 'New Birth Family created successfully', familyId: newFamilyId, memberId: member.id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @swagger
 * /api/members/{id}:
 *   put:
 *     summary: Update member
 *     tags: [Members]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             $ref: '#/components/schemas/Member'
 *     responses:
 *       200:
 *         description: Member updated
 */
// Update Member (Individual or from Linkage) with upload.any() for robustness
router.put('/:id', verifyToken, checkPermission('member.edit'), upload.any(), async (req, res) => {
    try {
        const idParam = req.params.id;
        
        // Support MemberID or MongoDB _id
        let member;
        if (idParam.startsWith('M')) {
            member = await Member.findOne({ memberId: idParam });
        } else {
            member = await Member.findByPk(idParam).catch(() => null);
        }

        if (!member) return res.status(404).json({ message: 'Member not found' });

        const mainId = member.id;
        // Strip id and memberId from req.body to prevent immutable field errors or logic collisions
        let { id, memberId, ...updates } = req.body;

        // Explicitly set the ID for upsertMemberRecursive to perform an UPDATE, not CREATE
        updates.id = member.id;

        // Handle Cloudinary File Uploads (upload.any() produces array in req.files)
        if (req.files && Array.isArray(req.files) && req.files.length > 0) {
            console.log(`[PUT /:id] Files received: ${req.files.length}`);
            req.files.forEach(f => {
                if (f.fieldname === 'photo') {
                    updates.photoUrl = f.path;
                    updates.photoId = f.filename;
                    console.log('[Upload] Main Photo uploaded to Cloudinary:', updates.photoUrl);
                } else if (f.fieldname === 'spousePhoto') {
                    updates.spousePhotoUrl = f.path;
                    // We need to pass this down to the spouse object if it exists in updates
                    console.log('[Upload] Spouse Photo uploaded to Cloudinary');
                }
            });
        } else {
             console.log('[PUT /:id] No files received or req.files is empty');
        }

        // Logic: New Family ID if Marriage Status changes
        if (updates.maritalStatus === 'Married' && member.maritalStatus !== 'Married' && !member.fatherId && !member.motherId) {
            if (!updates.familyId || updates.familyId === 'Unassigned') {
                updates.familyId = await generateFamilyId();
                updates.isPrimary = true;
            }
        }

        // BUNDLE SPOUSE DATA (Flat -> Nested for update)
        if (updates.spouseName) {
            updates.spouse = {
                firstName: updates.spouseName,
                middleName: updates.spouseMiddleName,
                lastName: updates.spouseLastName,
                prefix: updates.spousePrefix, // Map spousePrefix to prefix for the spouse member
                gender: updates.spouseGender,
                dob: updates.spouseDob,
                memberId: updates.spouseMemberId, // If provided
                // Use Existing Spouse ID if available
                id: updates.spouseId || member.spouseId || undefined
            };
            // If photo updated
            if (updates.spousePhotoUrl) {
                updates.spouse.photoUrl = updates.spousePhotoUrl;
                // Attempt to retrieve spouse photo ID if we have access to the file object corresponding to spousePhoto
                // req.files['spousePhoto'] is available in the scope above.
                if (req.files && req.files['spousePhoto']) {
                    updates.spouse.photoId = req.files['spousePhoto'][0].filename;
                }
            }
        }

        // Use Recursive Helper
        // Inject ID to ensure upsertMemberRecursive performs an UPDATE instead of a matching/new-create
        updates.id = mainId;

        const updatedMember = await upsertMemberRecursive(updates, {});

        // Invalidate dashboard cache when member is updated
        cacheService.del(cacheService.KEYS.DASHBOARD_STATS);

        res.json(updatedMember);

    } catch (err) {
        console.error("Update Error:", err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * @swagger
 * /api/members/{id}:
 *   delete:
 *     summary: Delete member
 *     tags: [Members]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Member deleted
 */
router.delete('/:id', verifyToken, checkPermission('member.delete'), async (req, res) => {
    try {
        await Member.destroy({ where: { id: req.params.id } });
        
        // Invalidate Dashboard Cache
        cacheService.del(cacheService.KEYS.DASHBOARD_STATS);

        res.json({ message: 'Member deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create Birth Family (Initialize new family tree for a member)
// This effectively makes them the Primary Member of a new Family ID.
router.post('/:id/create-family', verifyToken, checkPermission('member.edit'), async (req, res) => {
    try {
        const memberId = req.params.id;
        const member = await Member.findByPk(memberId);

        if (!member) {
            return res.status(404).json({ message: 'Member not found' });
        }

        // If member already has a Real Family (starting with F and not Unassigned/New), warning?
        // But user said "at any time". So we allow it.
        // It's like "moving out" or "claiming birthright".

        // Generate New Family ID
        const newFamilyId = await generateFamilyId();

        // Updates for Main Member
        member.familyId = newFamilyId;
        member.isPrimary = true; // They become the Head of this new tree
        await member.save();

        // Children Handling:
        // Logic: If I create a family, do my children come with me?
        // If they are my "birth" children, yes.
        // But if I am a mother, my children usually belong to my Husband's family.
        // The user requirement: "Mother's birth family" or "Son-in-Law's birth family".
        // Usually, a Mother's birth family does NOT include her children (they belong to Father's line).
        // A Son-In-Law's birth family DOES include his children (if he is the father).

        // So: Move children ONLY IF I am Male (Patrilineal assumption common in these communities) 
        // OR if the children were previously 'Unassigned' or attached to me specifically.

        // Revised Logic: 
        // If Male: Move children. 
        // If Female: Do NOT move children (they stay with Father, or if Father is unknown/unassigned, maybe move?)
        // Let's stick to: "Only move children if I am the Father".

        if (member.gender === 'Male') {
            const children = await Member.findAll({ where: { fatherId: member.id } });
            for (const child of children) {
                // Only move if they don't have a distinct family yet or are part of the old block
                // Actually, best to just move them to ensure tree continuity.
                child.familyId = newFamilyId;
                await child.save();
            }
        }

        res.json({
            message: 'New Birth Family created successfully',
            familyId: newFamilyId,
            memberId: member.id
        });

    } catch (err) {
        console.error("Create Family Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// Get Dashboard Stats (Custom) -> Only needs View permission
/**
 * @swagger
 * /api/members/stats/dashboard:
 *   get:
 *     summary: Get dashboard statistics (Counts for members, donations, events)
 *     tags: [Members]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard stats
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalMembers:
 *                   type: integer
 *                 maleCount:
 *                   type: integer
 *                 femaleCount:
 *                   type: integer
 *                 totalDonationAmount:
 *                   type: integer
 */
router.get('/stats/dashboard', verifyToken, checkPermission('member.view'), async (req, res) => {
    try {
        // const cached = cacheService.get(cacheService.KEYS.DASHBOARD_STATS);
        // if (cached) return res.json(cached);

        const [total, males, females, married, primary] = await Promise.all([
            Member.count({ where: { lifeStatus: { [Op.ne]: 'Deceased' } } }),
            Member.count({ where: { lifeStatus: { [Op.ne]: 'Deceased' }, gender: 'Male' } }),
            Member.count({ where: { lifeStatus: { [Op.ne]: 'Deceased' }, gender: 'Female' } }),
            Member.count({ where: { lifeStatus: { [Op.ne]: 'Deceased' }, maritalStatus: 'Married' } }),
            Member.count({ where: { lifeStatus: { [Op.ne]: 'Deceased' }, isPrimary: true } })
        ]);

        const [
            educationStats,
            maritalStats,
            districtStats,
            occupationStats,
            bloodGroupStats
        ] = await Promise.all([
            Member.findAll({
                attributes: ['education', [sequelize.fn('COUNT', sequelize.col('education')), 'count']],
                where: { lifeStatus: { [Op.ne]: 'Deceased' } },
                group: ['education'],
                raw: true
            }),
            Member.findAll({
                attributes: ['maritalStatus', [sequelize.fn('COUNT', sequelize.col('marital_status')), 'count']],
                where: { lifeStatus: { [Op.ne]: 'Deceased' } },
                group: ['maritalStatus'],
                raw: true
            }),
            Member.findAll({
                attributes: ['district', [sequelize.fn('COUNT', sequelize.col('district')), 'count']],
                where: { district: { [Op.ne]: null }, lifeStatus: { [Op.ne]: 'Deceased' } },
                group: ['district'],
                raw: true
            }),
            Member.findAll({
                attributes: ['occupationType', [sequelize.fn('COUNT', sequelize.col('occupation_type')), 'count']],
                where: { occupationType: { [Op.ne]: null }, lifeStatus: { [Op.ne]: 'Deceased' } },
                group: ['occupationType'],
                raw: true
            }),
            Member.findAll({
                attributes: ['bloodGroup', [sequelize.fn('COUNT', sequelize.col('blood_group')), 'count']],
                where: { bloodGroup: { [Op.ne]: null }, lifeStatus: { [Op.ne]: 'Deceased' } },
                group: ['bloodGroup'],
                raw: true
            })
        ]);

        const stats = {
            counts: {
                total, primary, male: males, female: females, married,
                families: await Member.count({ distinct: true, col: 'family_id' }),
                donationAmount: 0, 
                weekly: { total: 0, male: 0, female: 0, married: 0 }
            },
            charts: { 
                education: educationStats.map(s => ({ _id: s.education || 'Other', count: parseInt(s.count) })),
                age: await (async () => {
                    const allAges = await Member.findAll({
                        attributes: ['dob'],
                        where: { dob: { [Op.ne]: null }, lifeStatus: { [Op.ne]: 'Deceased' } },
                        raw: true
                    });
                    const buckets = { '0-18': 0, '19-35': 0, '36-50': 0, '51-70': 0, '70+': 0 };
                    allAges.forEach(m => {
                        const age = Math.floor((Date.now() - new Date(m.dob)) / 31557600000);
                        if (age <= 18) buckets['0-18']++;
                        else if (age <= 35) buckets['19-35']++;
                        else if (age <= 50) buckets['36-50']++;
                        else if (age <= 70) buckets['51-70']++;
                        else buckets['70+']++;
                    });
                    return Object.entries(buckets).map(([k, v]) => ({ _id: k, count: v }));
                })(),
                marital: maritalStats.map(s => ({ _id: s.maritalStatus || 'Other', count: parseInt(s.count) })),
                districts: districtStats.map(s => ({ _id: s.district, count: parseInt(s.count) })),
                occupations: occupationStats.map(s => ({ _id: s.occupationType || 'Other', count: parseInt(s.count) })),
                bloodGroups: bloodGroupStats.map(s => ({ _id: s.bloodGroup || 'Other', count: parseInt(s.count) }))
            },
            widgets: { recentMembers: [], donations: { totalAmount: 0, count: 0 }, eventCount: 0, invitations: [] }
        };

        // cacheService.set(cacheService.KEYS.DASHBOARD_STATS, stats, 300);
        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});



// Update showOnMatrimony flag
router.patch('/:id/matrimony-status', verifyToken, checkPermission('member.update'), async (req, res) => {
    try {
        const { showOnMatrimony } = req.body;
        const member = await Member.findByPk(req.params.id);
        if (!member) return res.status(404).json({ message: 'Member not found' });
        member.showOnMatrimony = showOnMatrimony;
        await member.save();
        res.json({ message: 'Matrimony status updated', member });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Eligible Relations
router.get('/eligible-relations', verifyToken, checkPermission('member.view'), async (req, res) => {
    try {
        const { type, gender, excludeId, familyId } = req.query;
        let where = {};
        if (gender) where.gender = gender;
        if (familyId) where.familyId = familyId;
        if (excludeId) where.id = { [Op.ne]: excludeId };

        const members = await Member.findAll({
            where,
            attributes: ['id', 'memberId', 'firstName', 'middleName', 'lastName', 'gender', 'dob', 'maritalStatus'],
            limit: 200,
            order: [['firstName', 'ASC']]
        });
        res.json(members);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Find by Pincode
router.get('/by-pincode/:pincode', verifyToken, checkPermission('member.view'), async (req, res) => {
    try {
        const { pincode } = req.params;
        const { gender, limit = 50 } = req.query;
        let where = {
            [Op.or]: [
                { 'geography.pincode': { [Op.iLike]: `%${pincode}%` } },
                { 'geography.full_address': { [Op.iLike]: `%${pincode}%` } }
            ]
        };
        if (gender) where.gender = gender;
        const members = await Member.findAll({ where, limit: parseInt(limit) });
        res.json(members);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Siblings
router.get('/:id/siblings', verifyToken, checkPermission('member.view'), async (req, res) => {
    try {
        const member = await Member.findByPk(req.params.id);
        if (!member || (!member.father_id && !member.mother_id)) return res.json({ siblings: [] });
        const siblings = await Member.findAll({
            where: {
                [Op.and]: [
                    { id: { [Op.ne]: member.id } },
                    { [Op.or]: [{ father_id: member.father_id }, { mother_id: member.mother_id }] }
                ]
            }
        });
        res.json({ siblings });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create family wrapper (already done in POST/PUT but keeping distinct route)
router.post('/:id/create-family', verifyToken, checkPermission('member.edit'), async (req, res) => {
    try {
        const member = await Member.findByPk(req.params.id);
        if (!member) return res.status(404).json({ message: 'Member not found' });
        const lastFamily = await Member.findOne({ order: [['familyId', 'DESC']] });
        const num = lastFamily && lastFamily.familyId.startsWith('F') ? parseInt(lastFamily.familyId.substring(1)) + 1 : 1;
        const newFamilyId = `F${num.toString().padStart(4, '0')}`;
        member.familyId = newFamilyId;
        member.isPrimary = true;
        await member.save();
        res.json({ message: 'New Birth Family created successfully', familyId: newFamilyId, memberId: member.id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;


// =========================================================
// HELPER: Auto-Create User for Primary Member
// =========================================================
async function ensureUserForPrimaryMember(member) {
    try {
        if (!member.isPrimary) return;

        const existingUser = await User.findOne({ where: { memberId: member.memberId } });
        if (existingUser) return;

        const mobileUsername = member.contact?.mobile?.trim();
        if (mobileUsername) {
            const userByMobile = await User.findOne({ where: { username: mobileUsername } });
            if (userByMobile) {
                if (!userByMobile.memberId) {
                    userByMobile.memberId = member.memberId;
                    await userByMobile.save();
                }
                return;
            }
        }

        const username = mobileUsername || member.memberId;
        const plainPassword = mobileUsername || '123456';
        const hashedPassword = await require('bcrypt').hash(plainPassword, 10);

        await User.create({
            username: username,
            password: hashedPassword,
            name: member.fullName || `${member.firstName} ${member.lastName}`,
            email: member.contact?.email || null,
            mobile: member.contact?.mobile || null,
            memberId: member.memberId,
            role: 'Member',
            isVerified: true,
            permissions: [
                'dashboard.view',
                'stats.view',
                'member.view',
                'family.view'
            ]
        });
    } catch (err) {
        console.error(`[Auto-User] Failed to create user for member ${member.memberId}:`, err);
    }
}


