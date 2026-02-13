const express = require('express');
const Member = require('../models/Member');
const Marriage = require('../models/Marriage');
const User = require('../models/User'); // Added for Auto-User Creation
const bcrypt = require('bcryptjs');     // Added for Password Hashing
const { verifyToken, checkPermission } = require('../middleware/authMiddleware');
const { upload, uploadBase64 } = require('../config/cloudinary');
const path = require('path');
const cacheService = require('../services/cache.service');
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
// Get All Members (Search/Filter support & Pagination)
router.get('/', verifyToken, checkPermission('member.view'), async (req, res) => {
    try {
        const { paginate } = require('../utils/pagination');
        const { search, familyId, isPrimary, showDeceased, gender, maritalStatus, name, location, contact, state, district, city, village } = req.query;
        
        const page = parseInt(req.query.page) || 1;
        const limitParam = req.query.limit;
        const limit = limitParam === '0' ? 0 : (parseInt(limitParam) || 20);

        let query = {};
        const andConditions = [];
        
        // 1. Life Status Filter (Default: Hide Deceased AND Swa./Late prefixes)
        if (!showDeceased || showDeceased.toString().toLowerCase() !== 'true') {
            // OPTIMIZATION: Use Equality instead of $ne for better index usage with sorting
            andConditions.push({ lifeStatus: 'Alive' });
            andConditions.push({ prefix: { $ne: 'स्व.' } }); // Hindi Swa.
            andConditions.push({ prefix: { $not: /Late/i } });
            andConditions.push({ prefix: { $not: /^Swa/i } });
        }

        // 2. Explicit Filters
        if (isPrimary && isPrimary.toString().toLowerCase().trim() === 'true') query.isPrimary = true;
        

        if (req.query.showOnMatrimony === 'true') query.showOnMatrimony = true;
        if (gender) query.gender = gender.trim();
        if (maritalStatus) query.maritalStatus = maritalStatus.trim();
        if (familyId) query.familyId = familyId;
        if (req.query.fatherId) query.father = req.query.fatherId;
        if (req.query.motherId) query.mother = req.query.motherId;

        // 3. Search Query (Optimized with $text)
        if (search && search.trim()) {
            const trimmedSearch = search.trim();
            // If it looks like a Member ID, use exact match/regex on memberId field
            if (/^M\d+$/i.test(trimmedSearch)) {
                andConditions.push({ memberId: new RegExp(trimmedSearch, 'i') });
            } else {
                // Use Text Search for improved performance and Marathi support
                andConditions.push({ $text: { $search: trimmedSearch } });
            }
        }

        // 4. Advanced Property Filters (Name, Location, Contact)
        function escapeRegex(text) { return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'); }

        if (name) {
            const nameRegex = new RegExp(escapeRegex(name.trim()), 'i');
            andConditions.push({ $or: [{ firstName: nameRegex }, { lastName: nameRegex }, { fullName: nameRegex }] });
        }

        if (location) {
            const locRegex = new RegExp(escapeRegex(location.trim()), 'i');
            andConditions.push({ $or: [{ city: locRegex }, { village: locRegex }, { district: locRegex }, { state: locRegex }] });
        }

        if (contact) andConditions.push({ 'contact.mobile': new RegExp(escapeRegex(contact.trim()), 'i') });

        // Location granular filters
        if (state) andConditions.push({ $or: [{ state: new RegExp(escapeRegex(state.trim()), 'i') }, { 'geography.state': new RegExp(escapeRegex(state.trim()), 'i') }] });
        if (district) andConditions.push({ $or: [{ district: new RegExp(escapeRegex(district.trim()), 'i') }, { 'geography.district': new RegExp(escapeRegex(district.trim()), 'i') }] });
        if (city) andConditions.push({ $or: [{ city: new RegExp(escapeRegex(city.trim()), 'i') }, { taluka: new RegExp(escapeRegex(city.trim()), 'i') }, { 'geography.taluka': new RegExp(escapeRegex(city.trim()), 'i') }] });
        if (village) andConditions.push({ $or: [{ village: new RegExp(escapeRegex(village.trim()), 'i') }, { 'geography.village': new RegExp(escapeRegex(village.trim()), 'i') }] });

        if (andConditions.length > 0) query.$and = andConditions;

        // Sorting
        const { sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
        const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

        // Execute Pagination

        
        // Note: If limit is 0, we bypass the min/max in paginate utility if it causes issues, but utility maxes at 100.
        // For 'load all' (limit=0), we handle it separately here to avoid restricting to 100.
        
        const selectFields = 'memberId firstName middleName lastName fullName prefix gender dob lifeStatus maritalStatus photoUrl contact education occupation occupationType jobType city district taluka village state geography familyId isPrimary verification createdBy createdAt';

        let result;
        if (limit === 0) {
            const data = await Member.find(query).sort(sort).select(selectFields).lean();
            result = { data, pagination: { total: data.length, page: 1, limit: 0, pages: 1 } };
        } else {
            result = await paginate(Member, query, { page, limit, sort, lean: true, select: selectFields });
        }

        // 5. Add Registration Status
        const memberIds = result.data.map(m => m.memberId);
        // const User = require('../models/User');
        // const startUserLookup = Date.now();
        // const registeredUsers = await User.find({ memberId: { $in: memberIds } }).select('memberId').lean();
        // const userLookupTime = Date.now() - startUserLookup;
        // if (userLookupTime > 100) {
        //     console.log(`[PERF] User Lookup took ${userLookupTime}ms for ${memberIds.length} members.`);
        // }
        // const registeredMemberIds = new Set(registeredUsers.map(u => u.memberId));
        const registeredMemberIds = new Set();

        const membersWithStatus = result.data.map(m => ({
            ...m,
            isRegistered: registeredMemberIds.has(m.memberId)
        }));



        res.json({
            data: membersWithStatus,
            currentPage: result.pagination.page,
            totalPages: result.pagination.pages,
            totalMembers: result.pagination.total
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
        console.log(`[DEBUG] GET /members/:id called with id: ${idParam}`);

        let member;

        if (idParam.startsWith('M')) {
            console.log(`[DEBUG] Detected Custom ID. Searching by memberId.`);
            // Assume it's a custom Member ID
            member = await Member.findOne({ memberId: idParam });
        } else {
            console.log(`[DEBUG] Detected Mongo ID. Searching by _id.`);
            // Assume it's a Mongo ID
            member = await Member.findById(idParam);
        }

        if (!member) {
            console.log(`[DEBUG] Member not found.`);
            return res.status(404).json({ message: 'Member not found' });
        }
        res.json(member);
    } catch (err) {
        console.error(`[DEBUG] Error in GET /members/:id:`, err.message);

        // Fallback: If findById fails (e.g. invalid format), try findOne by memberId just in case
        try {
            const memberFallback = await Member.findOne({ memberId: req.params.id });
            if (memberFallback) return res.json(memberFallback);
        } catch (ignore) { }

        res.status(500).json({ error: err.message });
    }
});

/**
 * @swagger
 * /api/members/{id}/edit-profile:
 *   get:
 *     summary: Get member and spouse data for edit form
 *     description: Returns the opened member and their linked spouse in a predictable shape for form population
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
 *         description: Member and spouse data
 */
router.get('/:id/edit-profile', verifyToken, checkPermission('member.view'), async (req, res) => {
    try {
        const idParam = req.params.id;
        console.log(`[DEBUG] GET /members/:id/edit-profile called with id: ${idParam}`);

        let member = idParam.startsWith('M')
            ? await Member.findOne({ memberId: idParam })
            : await Member.findById(idParam);

        if (!member) {
            return res.status(404).json({ message: 'Member not found' });
        }

        // Fetch spouse if linked (gender-agnostic - whoever is linked is the spouse)
        let spouse = null;
        if (member.spouse) {
            spouse = await Member.findById(member.spouse);
        }

        console.log(`[DEBUG] edit-profile returning member: ${member.firstName}, spouse: ${spouse?.firstName || 'none'}`);
        res.json({ member, spouse });
    } catch (err) {
        console.error(`[DEBUG] Error in GET /members/:id/edit-profile:`, err.message);
        res.status(500).json({ error: err.message });
    }
});

// --------------------------------------------------------------------------


/**
 * @swagger
 * /api/members/{id}/profile-optimized:
 *   get:
 *     summary: Get optimized member profile with immediate family
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
 *         description: Optimized profile data
 */
router.get('/:id/profile-optimized', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        let member;
        
        // 1. Find the Central Person
        if (id.startsWith('M')) {
            member = await Member.findOne({ memberId: id }).lean();
        } else {
            member = await Member.findById(id).lean();
        }

        if (!member) return res.status(404).json({ message: 'Member not found' });

        // Projection for lightweight cards
        const projection = {
            firstName: 1, middleName: 1, lastName: 1, fullName: 1,
            photoUrl: 1, gender: 1, dob: 1, memberId: 1, lifeStatus: 1,
            education: 1, occupation: 1, occupationType: 1,
            state: 1, district: 1, taluka: 1, village: 1, geography: 1,
            contact: 1, maritalStatus: 1,
            father: 1, mother: 1, spouse: 1 // Need these for identifying relations
        };

        // 2. Prepare Lookups
        const family = {
            spouse: null,
            children: [],
            father: null,
            mother: null,
            siblings: [],
            grandchildren: []
        };

        // Parallel Batch 1: Direct Lookups (Spouse, Parents, Siblings, Children-by-Parent-Ref)
        const batch1 = {};

        // Spouse
        if (member.spouse) {
            batch1.spouse = Member.findById(member.spouse).select(projection).lean();
        }

        // Parents
        if (member.father) {
            batch1.father = Member.findById(member.father).select(projection).lean();
        }
        if (member.mother) {
            batch1.mother = Member.findById(member.mother).select(projection).lean();
        }

        // Children (Robust Lookup: Find by Parent Reference instead of relying on array)
        batch1.children = Member.find({
            $or: [
                { father: member._id },
                { mother: member._id },
                // Fallback for string-based IDs if used in legacy
                { fatherMemberId: member.memberId },
                { motherMemberId: member.memberId }
            ]
        }).select(projection).lean();

        // Siblings
        if (member.father || member.mother) {
            const siblingQuery = {
                _id: { $ne: member._id },
                $or: []
            };
            if (member.father) siblingQuery.$or.push({ father: member.father });
            if (member.mother) siblingQuery.$or.push({ mother: member.mother });
            batch1.siblings = Member.find(siblingQuery).select(projection).lean();
        }

        // Execute Batch 1
        const results1 = await Promise.all(Object.values(batch1));
        const keys1 = Object.keys(batch1);
        
        keys1.forEach((key, index) => {
            family[key] = results1[index];
        });

        // 3. Sequential Step: Grandchildren (Depend on Children IDs)
        if (family.children && family.children.length > 0) {
            const childIds = family.children.map(c => c._id);
            family.grandchildren = await Member.find({
                $or: [
                    { father: { $in: childIds } },
                    { mother: { $in: childIds } }
                ]
            }).select(projection).lean();
        }

        // 4. Structure Response
        res.json({
            member,
            family
        });

    } catch (err) {
        console.error('[ERROR] /members/:id/profile-optimized:', err);
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

        const result = await Member.deleteMany({ _id: { $in: ids } });

        res.json({ 
            message: `${result.deletedCount} members deleted successfully`, 
            deletedCount: result.deletedCount,
            ids 
        });
    } catch (err) {
        console.error('[Batch Delete Error]', err);
        res.status(500).json({ error: err.message });
    }
});

// INTERNAL HANDLER FOR BOTH PUT AND POST
async function handleBulkSave(req, res) {
    const mongoose = require('mongoose');
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        let payload = req.body;
        
        // Handle Multipart/Form-Data (if 'data' field exists)
        if (req.body.data) {
            try {
                payload = JSON.parse(req.body.data);
            } catch (e) {
                console.error('Failed to parse req.body.data JSON:', e);
                return res.status(400).json({ message: 'Invalid JSON data in form payload' });
            }
        }

        console.log('[DEBUG] bulk-save payload members:', payload.member ? payload.member.firstName : 'Unknown');

        // ---------------------------------------------------------
        // SECURITY CHECK: Role-Based Family Restriction
        // ---------------------------------------------------------
        if (req.user.role !== 'SuperAdmin' && req.user.role !== 'Admin') {
            // Regular users can ONLY edit/add to their own Family
            const userFamilyId = req.user.familyId;
            
            // 1. Check Payload Family ID (if new member)
            // If they are trying to set a familyId, it must match theirs (unless creating new family - but regular users usually join/edit)
            // Actually, regular users usually shouldn't be creating NEW families from scratch via this route if restricts apply.
            // But let's check the TARGET Member.
            
            let targetMemberId = payload.member.memberId || payload.member.id || payload.member._id;
            
            if (targetMemberId) {
                // Editing Existing Member OR Adding with ID
                // We must verify this target member belongs to the user's family
                let targetParams = {};
                if (targetMemberId.toString().startsWith('M')) targetParams.memberId = targetMemberId;
                else targetParams._id = targetMemberId;

                const existingMember = await Member.findOne(targetParams);
                if (existingMember) {
                    // Check Family ID match
                    if (existingMember.familyId !== userFamilyId) {
                         console.warn(`[Security] User ${req.user.memberId} (Family: ${userFamilyId}) tried to edit ${existingMember.memberId} (Family: ${existingMember.familyId})`);
                         return res.status(403).json({ message: 'Access Denied: You can only edit members of your own family.' });
                    }
                }
            } else {
                // Creating New Member - Force Family ID to match User's
                // Or deny if they try to set a different one?
                // Let's enforce: If creating new, it will be assigned to User's Family implicitly or explicitly checked
                if (payload.member.familyId && payload.member.familyId !== userFamilyId && payload.member.familyId !== 'FNew') {
                     // Allowing 'FNew' might be risky if they can create rogue families, but usually acceptable for "New Family" feature.
                     // However, "Edit only his family" implies he shouldn't be creating NEW families either? 
                     // Assuming "Add Child" uses this - it sends familyId.
                     
                     if (payload.member.familyId !== userFamilyId) {
                         return res.status(403).json({ message: 'Access Denied: You cannot add members to other families.' });
                     }
                }
            }
        }
        // ---------------------------------------------------------


        // MAP UPLOADED FILES TO PAYLOAD
        if (req.files && req.files.length > 0) {
            console.log(`[Upload] Processing ${req.files.length} uploaded files...`);
            req.files.forEach(f => console.log(`[Upload] File field: ${f.fieldname}, Size: ${f.size}, Path: ${f.path}`));
            
            req.files.forEach(file => {
                const url = file.path;
                const publicId = file.filename;
                const fieldName = file.fieldname;

                if (fieldName === 'member_photo') {
                    if (payload.member) {
                        payload.member.photoUrl = url;
                        payload.member.photoId = publicId;
                        console.log(`[Upload] Mapped member_photo to payload.member.photoUrl: ${url}`);
                    }
                    if (payload.member && payload.member.spouse) {
                        payload.member.spouse.photoUrl = url;
                        payload.member.spouse.photoId = publicId;
                        console.log(`[Upload] Mapped spouse_photo -> ${url}`);
                    }
                } else if (fieldName.startsWith('child_')) {
                    // formats: child_i_photo OR child_spouse_i_photo
                    // wait, my frontend logic was: child_i_photo AND child_spouse_i_photo
                    // AND grand children: gc_i_j_photo
                    
                    if (fieldName.includes('child_spouse_')) {
                        // child_spouse_0_photo
                        const parts = fieldName.split('_'); // ['child', 'spouse', '0', 'photo']
                        const index = parseInt(parts[2], 10);
                        if (payload.member.children && payload.member.children[index]) {
                            // Spouse is usually part of child object in flat structure or nested?
                            // In buildNestedPayload: childMember.spouse = ...
                            if (payload.member.children[index].spouse) {
                                payload.member.children[index].spouse.photoUrl = url;
                                payload.member.children[index].spouse.photoId = publicId;
                            }
                        }
                    } else if (fieldName.match(/^child_\d+_photo$/)) {
                        // child_0_photo
                        const parts = fieldName.split('_'); // ['child', '0', 'photo']
                        const index = parseInt(parts[1], 10);
                        if (payload.member.children && payload.member.children[index]) {
                            payload.member.children[index].photoUrl = url;
                            payload.member.children[index].photoId = publicId;
                        }
                    }
                } else if (fieldName.startsWith('gc_')) {
                    // gc_i_j_photo OR gc_spouse_i_j_photo
                    if (fieldName.includes('gc_spouse_')) {
                         const parts = fieldName.split('_'); // ['gc', 'spouse', '0', '0', 'photo']
                         const childIdx = parseInt(parts[2], 10);
                         const gcIdx = parseInt(parts[3], 10);
                         
                         if (payload.member.children && payload.member.children[childIdx] && 
                             payload.member.children[childIdx].children && 
                             payload.member.children[childIdx].children[gcIdx]) {
                                 
                             const gc = payload.member.children[childIdx].children[gcIdx];
                             if (gc.spouse) {
                                 gc.spouse.photoUrl = url;
                                 gc.spouse.photoId = publicId;
                             }
                         }
                    } else {
                        // gc_i_j_photo
                        const parts = fieldName.split('_'); // ['gc', '0', '0', 'photo']
                        const childIdx = parseInt(parts[1], 10);
                        const gcIdx = parseInt(parts[2], 10);
                        
                        if (payload.member.children && payload.member.children[childIdx] && 
                             payload.member.children[childIdx].children && 
                             payload.member.children[childIdx].children[gcIdx]) {
                            
                             const gc = payload.member.children[childIdx].children[gcIdx];
                             gc.photoUrl = url;
                             gc.photoId = publicId;
                        }
                    }
                }
            });
        }

        const allToUpsert = [];
        const marriages = [];

        // Pre-fetch the current max memberId to use as counter base
        const lastMember = await Member.findOne({ memberId: /^M\d+$/ }).sort({ memberId: -1 });
        let memberIdCounter = lastMember && lastMember.memberId 
            ? parseInt(lastMember.memberId.substring(1)) 
            : 0;

        // Pre-fetch familyId once at the start
        const lastFamily = await Member.findOne({ familyId: /^F\d+$/ }).sort({ familyId: -1 });
        let familyIdCounter = lastFamily && lastFamily.familyId 
            ? parseInt(lastFamily.familyId.substring(1)) 
            : 0;
        let generatedFamilyId = null; // Will be set once for the whole family

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
            
            // Base64 logic removed. Frontend now uploads directly to Cloudinary and sends URLs.

            // 1. Map to Optimized Structure of Current Node
            const data = mapFlatToOptimized(node);
            console.log(`[DEBUG] mapped node: ${data.firstName}, memberId: ${data.memberId}, _id: ${data._id}`);
            if (!data._id) data._id = node._id || new mongoose.Types.ObjectId();
            if (!data.memberId) {
                data.memberId = getNextMemberId();
                console.log(`[DEBUG] generated new memberId: ${data.memberId} for ${data.firstName}`);
            }

            // 1.5. Inherit Geography from Context if missing
            if (context.geography) {
                if (!data.geography) data.geography = {};
                // Inherit state/district/taluka/village/address if not provided for this node
                const geoFields = ['state', 'district', 'taluka', 'village', 'full_address', 'pincode'];
                geoFields.forEach(f => {
                    if (!data.geography[f] && context.geography[f]) {
                        data.geography[f] = context.geography[f];
                    }
                });
                
                // Also sync top-level fields for indexing
                data.state = data.state || data.geography.state;
                data.district = data.district || data.geography.district;
                data.taluka = data.taluka || data.geography.taluka;
                data.city = data.city || data.geography.taluka;
                data.village = data.village || data.geography.village;
            }
            
            // 2. Inherit/Set Family Context
            // Treat 'FNew' and 'Unassigned' as invalid - generate a proper ID
            if (context.familyId && context.familyId !== 'FNew' && context.familyId !== 'Unassigned') {
                data.familyId = context.familyId;
            } else if (!data.familyId || data.familyId === 'FNew' || data.familyId === 'Unassigned') {
                if (!generatedFamilyId) generatedFamilyId = getNextFamilyId();
                data.familyId = generatedFamilyId;
            }
            
            if (context.father) {
                data.father = context.father;
                if (context.fatherMemberId) data.fatherMemberId = context.fatherMemberId;
            }
            if (context.mother) {
                data.mother = context.mother;
                if (context.motherMemberId) data.motherMemberId = context.motherMemberId;
            }

            // 3. Handle Spouse of this node
            if (node.spouse) {
                // Base64 logic removed for Spouse.

                const sData = mapFlatToOptimized(node.spouse);
                if (!sData._id) sData._id = node.spouse._id || new mongoose.Types.ObjectId();
                if (!sData.memberId) sData.memberId = getNextMemberId(); // Use counter-based ID
                // Spouse inherits member's geography (they live together)
                if (data.geography) {
                    if (!sData.geography) sData.geography = {};
                    const geoFields = ['state', 'district', 'taluka', 'village', 'full_address', 'pincode'];
                    geoFields.forEach(f => {
                        if (!sData.geography[f] && data.geography[f]) {
                            sData.geography[f] = data.geography[f];
                        }
                    });
                    
                    // Sync top-level fields for indexing and display
                    sData.state = sData.state || sData.geography.state;
                    sData.district = sData.district || sData.geography.district;
                    sData.taluka = sData.taluka || sData.geography.taluka;
                    sData.city = sData.city || sData.geography.taluka;
                    sData.village = sData.village || sData.geography.village;
                }

                sData.familyId = data.familyId;

                // Circular Linkage (ObjectIds)
                data.spouse = sData._id;
                sData.spouse = data._id;
                
                // Also set string MemberIds for frontend
                data.spouseMemberId = sData.memberId;
                sData.spouseMemberId = data.memberId;

                allToUpsert.push(sData);
                
                // Add to Marriage Collection
                marriages.push({
                    husbandId: data.gender === 'Male' ? data._id : sData._id,
                    wifeId: data.gender === 'Female' ? data._id : sData._id,
                    status: 'Active'
                });
            }

            // 4. Handle Children of this node
            if (node.children && Array.isArray(node.children)) {
                const childIds = [];
                
                // Determine father and mother MemberIds for children
                let fatherObjId = data.gender === 'Male' ? data._id : (context.father || null);
                let motherObjId = data.gender === 'Female' ? data._id : (context.mother || null);
                let fatherMId = data.gender === 'Male' ? data.memberId : (context.fatherMemberId || null);
                let motherMId = data.gender === 'Female' ? data.memberId : (context.motherMemberId || null);
                
                // If member has spouse, use spouse as the other parent
                if (node.spouse && data.gender === 'Male') {
                    motherObjId = data.spouse;
                    const spouseData = allToUpsert.find(m => m._id && m._id.toString() === data.spouse.toString());
                    if (spouseData) motherMId = spouseData.memberId;
                } else if (node.spouse && data.gender === 'Female') {
                    fatherObjId = data.spouse;
                    const spouseData = allToUpsert.find(m => m._id && m._id.toString() === data.spouse.toString());
                    if (spouseData) fatherMId = spouseData.memberId;
                }
                
                for (const c of node.children) {
                    const cContext = {
                        familyId: data.familyId,
                        father: fatherObjId,
                        mother: motherObjId,
                        fatherMemberId: fatherMId,
                        motherMemberId: motherMId,
                        geography: data.geography // Pass geography to children for inheritance
                    };
                    const savedC = await processRecursive(c, cContext);
                    if (savedC) childIds.push(savedC._id);
                }
                data.children = childIds;
            }

            allToUpsert.push(data);
            return data;
        }

        // Start recursion from the main member
        // Pass familyId only if it's a valid ID (not 'FNew' or 'Unassigned')
        const initialFamilyId = (payload.member.familyId && payload.member.familyId !== 'FNew' && payload.member.familyId !== 'Unassigned') 
            ? payload.member.familyId : null;
        await processRecursive(payload.member, { familyId: initialFamilyId });

        // Build Bulk Operations
        const ops = allToUpsert.map(m => {
            const { _id, ...updateData } = m; // Strip _id from $set to avoid Mongo errors
            return {
                updateOne: {
                    filter: { _id: _id },
                    update: { $set: updateData },
                    upsert: true
                }
            };
        });

        if (ops.length > 0) {
            await Member.bulkWrite(ops, { session });
        }

        // Save Marriages
        if (marriages.length > 0) {
            const Marriage = require('../models/Marriage');
            const mOps = marriages.map(m => ({
                updateOne: {
                    filter: { husbandId: m.husbandId, wifeId: m.wifeId },
                    update: { $set: m },
                    upsert: true
                }
            }));
            await Marriage.bulkWrite(mOps, { session });
        }

        await session.commitTransaction();
        
        // Return the main member data for frontend to use when linking children
        const mainMember = allToUpsert[0];

        // ---------------------------------------------------------
        // AUTO-CREATE USER FOR PRIMARY MEMBERS (AND SPOUSES IF PRIMARY)
        // ---------------------------------------------------------
        // We do this AFTER the transaction ensures Member existence
        console.log('[Bulk Save] Checking for Auto-User Creation...');
        for (const mData of allToUpsert) {
             // We need the saved member from DB to be sure of ID/MemberID
             // Since we upserted, we can fetch or just try to use the mData if it has _id
             if (mData.isPrimary && mData.memberId) {
                 const recentMember = await Member.findOne({ memberId: mData.memberId });
                 if (recentMember) {
                     await ensureUserForPrimaryMember(recentMember);
                 }
             }
        }



        res.status(200).json({ 
            message: 'Family branch saved successfully', 
            familyId: mainMember.familyId,
            _id: mainMember._id,
            memberId: mainMember.memberId,
            spouseId: mainMember.spouse,
            spouseMemberId: mainMember.spouseMemberId,
            savedCount: allToUpsert.length
        });
    } catch (err) {
        await session.abortTransaction();
        console.error('[ERROR] /members/bulk-save:', err);
        res.status(500).json({ error: err.message });
    } finally {
        session.endSession();
    }
}

// Helper to generate IDs (moved here if not already available)
async function generateMemberId() {
    const lastMember = await Member.findOne({ memberId: /^M\d+$/ }).sort({ memberId: -1 });
    if (lastMember && lastMember.memberId) {
        const num = parseInt(lastMember.memberId.substring(1)) + 1;
        return `M${num.toString().padStart(4, '0')}`;
    }
    return 'M0001';
}

async function generateFamilyId() {
    const lastMember = await Member.findOne({ familyId: /^F\d+$/ }).sort({ familyId: -1 });
    if (lastMember && lastMember.familyId) {
        const num = parseInt(lastMember.familyId.substring(1)) + 1;
        return `F${num.toString().padStart(4, '0')}`;
    }
    return 'F0001';
}

// Helper to Map Flat Payload to Optimized Schema
function mapFlatToOptimized(payload) {
    console.log('[DEBUG] mapFlatToOptimized input payload memberId:', payload.memberId, '_id:', payload._id || payload.id);
    const clean = (val) => (typeof val === 'string' ? val.trim().replace(/\s+/g, ' ') : val);
    
    // Identity & Bio
    const data = {
        firstName: clean(payload.firstName),
        middleName: clean(payload.middleName),
        lastName: clean(payload.lastName),
        prefix: clean(payload.prefix),
        gender: payload.gender,
        dob: payload.dob ? new Date(payload.dob) : null, // Explicit cast to Date
        lifeStatus: payload.lifeStatus || 'Alive',
        maritalStatus: payload.maritalStatus,
        education: clean(payload.education),
        occupation: clean(payload.occupation),
        occupationType: payload.occupationType,
        photoUrl: payload.photoUrl,
        photoId: payload.photoId, // Save Cloudinary Public ID
        showOnMatrimony: String(payload.showOnMatrimony) === 'true',
        blood_group: payload.blood_group,
        height: clean(payload.height),
        hobbies: Array.isArray(payload.hobbies) ? payload.hobbies : (payload.hobbies ? [payload.hobbies] : []),
        familyId: payload.familyId,
        // Ensure Deceased members cannot be Primary
        isPrimary: (payload.lifeStatus === 'Deceased' || clean(payload.prefix) === 'स्व.') 
            ? false 
            : String(payload.isPrimary) === 'true',
        maidenName: clean(payload.maidenName),
        lineage_links: payload.lineage_links || {} 
    };

    // Manually calculate fullName for updates (bypasses pre-save hook)
    if (data.firstName && data.lastName) {
        const p = data.prefix ? data.prefix + ' ' : '';
        const m = data.middleName ? data.middleName + ' ' : '';
        data.fullName = `${p}${data.firstName} ${m}${data.lastName}`.replace(/\s+/g, ' ').trim();
    }

    // Contact
    data.contact = {
        mobile: clean(payload.phone || payload.mobile),
        email: clean(payload.email),
        whatsapp: clean(payload.whatsapp)
    };

    // Geography
    data.geography = {
        pincode: payload.pincode,
        state: payload.state,
        district: payload.district,
        taluka: payload.city || payload.taluka,
        village: payload.village,
        full_address: clean(payload.address)
    };

    // Relations (Refs)
    if (payload.fatherId) data.father = payload.fatherId;
    if (payload.motherId) data.mother = payload.motherId;
    if (payload.spouseId) data.spouse = payload.spouseId;
    if (payload.childrenIds) data.children = Array.isArray(payload.childrenIds) ? payload.childrenIds : [payload.childrenIds];
    
    // Explicitly carry over IDs if present
    if (payload._id) data._id = payload._id;
    if (payload.memberId) data.memberId = payload.memberId;

    return data;
}

// Recursive Upsert Helper (Optimized)
async function upsertMemberRecursive(memberData, context = {}) {
    try {
        let data = mapFlatToOptimized({ ...memberData });

        // Inherit Context
        if (context.familyId) data.familyId = context.familyId;
        if (context.father) data.father = context.father;
        if (context.mother) data.mother = context.mother;

        let savedMember;
        const existsId = memberData.id || memberData._id;

        if (existsId) {
            const { _id, ...updateFields } = data; // Strip _id for safety
            savedMember = await Member.findByIdAndUpdate(existsId, updateFields, { new: true });
        } else {
            if (!data.memberId) data.memberId = await generateMemberId();
            if (!data.lastName && context.lastName) data.lastName = context.lastName;
            savedMember = await new Member(data).save();
        }

        if (!savedMember) return null;

        // Helper to Ensure User Account exists for Primary Members
        if (savedMember.isPrimary) {
             await ensureUserForPrimaryMember(savedMember);
        }

        // Handle Spouse
        if (memberData.spouse) {
            let spouseData = typeof memberData.spouse === 'string' ? JSON.parse(memberData.spouse) : memberData.spouse;
            spouseData = mapFlatToOptimized(spouseData);
            spouseData.familyId = savedMember.familyId;
            spouseData.spouse = savedMember._id;
            
            if (!spouseData.lastName) spouseData.lastName = savedMember.lastName;

            // Spouse inherits member's geography (they live together)
            // Only copy if spouse doesn't have their own location set
            if (savedMember.geography) {
                if (!spouseData.geography) {
                    spouseData.geography = {};
                }
                // Inherit each field only if not already set on spouse
                const geoFields = ['state', 'district', 'taluka', 'village', 'full_address', 'pincode'];
                geoFields.forEach(f => {
                    if (!spouseData.geography[f] && savedMember.geography[f]) {
                        spouseData.geography[f] = savedMember.geography[f];
                    }
                });

                // Sync top-level fields for indexing and display
                spouseData.state = spouseData.state || spouseData.geography.state;
                spouseData.district = spouseData.district || spouseData.geography.district;
                spouseData.taluka = spouseData.taluka || spouseData.geography.taluka;
                spouseData.city = spouseData.city || spouseData.geography.taluka;
                spouseData.village = spouseData.village || spouseData.geography.village;
            }

            let savedSpouse;
            const sId = spouseData.id || spouseData._id;
            if (sId) {
                savedSpouse = await Member.findByIdAndUpdate(sId, spouseData, { new: true });
            } else {
                // Check existing marriage for duplicate prevention
                const Marriage = require('../models/Marriage');
                const existingMarriage = await Marriage.findOne({
                    $or: [{ husbandId: savedMember._id }, { wifeId: savedMember._id }],
                    status: 'Active'
                });

                if (existingMarriage) {
                    const existingSpouseId = existingMarriage.husbandId.toString() === savedMember._id.toString() 
                        ? existingMarriage.wifeId 
                        : existingMarriage.husbandId;
                    savedSpouse = await Member.findByIdAndUpdate(existingSpouseId, spouseData, { new: true });
                } else {
                    if (!spouseData.memberId) spouseData.memberId = await generateMemberId();
                    savedSpouse = await new Member(spouseData).save();
                }
            }

            if (savedSpouse) {
                const Marriage = require('../models/Marriage');
                await Marriage.findOneAndUpdate(
                    {
                        $or: [
                            { husbandId: savedMember._id, wifeId: savedSpouse._id },
                            { husbandId: savedSpouse._id, wifeId: savedMember._id }
                        ]
                    },
                    {
                        husbandId: savedMember.gender === 'Male' ? savedMember._id : savedSpouse._id,
                        wifeId: savedMember.gender === 'Female' ? savedMember._id : savedSpouse._id,
                        status: 'Active'
                    },
                    { upsert: true, new: true }
                );

                // Bidirectional Link
                savedMember.spouse = savedSpouse._id;
                await savedMember.save();
            }
        }

        // Handle Children (Recursive)
        if (memberData.children) {
            const childrenData = typeof memberData.children === 'string' ? JSON.parse(memberData.children) : memberData.children;
            if (Array.isArray(childrenData) && childrenData.length > 0) {
                const childIds = [];
                for (const child of childrenData) {
                    const childContext = {
                        familyId: savedMember.familyId,
                        father: savedMember.gender === 'Male' ? savedMember._id : (context.father || null),
                        mother: savedMember.gender === 'Female' ? savedMember._id : (context.mother || null),
                        lastName: savedMember.lastName
                    };
                    const savedChild = await upsertMemberRecursive(child, childContext);
                    if (savedChild) childIds.push(savedChild._id);
                }
                savedMember.children = childIds;
                await savedMember.save();
            }
        }

        return savedMember;
    } catch (err) {
        console.error("Recursive Upsert Error:", err);
        throw err;
    }
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
// Create New Member with robust upload handling
router.post('/', verifyToken, checkPermission('member.create'), upload.any(), async (req, res) => {
    try {
        const payload = req.body;

        // Handle Cloudinary File Uploads (upload.any() produces array in req.files)
        if (req.files && Array.isArray(req.files) && req.files.length > 0) {
            console.log(`[POST /] Files received: ${req.files.length}`);
            req.files.forEach(f => {
                if (f.fieldname === 'photo') {
                    payload.photoUrl = f.path;
                    payload.photoId = f.filename; // Capture Public ID
                    console.log('[Upload] Main Photo uploaded to Cloudinary:', payload.photoUrl);
                } else if (f.fieldname === 'spousePhoto') {
                    payload.spousePhotoUrl = f.path;
                    // Note: Spouse photo ID handling might need to be nested or separate if spouse is a separate entity logic in recursive
                    console.log('[Upload] Spouse Photo uploaded to Cloudinary');
                }
            });
        } else {
             console.log('[POST /] No files received or req.files is empty');
        }

        // Use Recursive Upsert for clean handling
        const savedMember = await upsertMemberRecursive(payload);
        
        res.status(201).json(savedMember);
    } catch (err) {
        console.error('[ERROR] POST /members:', err);
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
            member = await Member.findById(idParam).catch(() => null);
        }

        if (!member) return res.status(404).json({ message: 'Member not found' });

        const mainId = member._id.toString();
        // Strip id and memberId from req.body to prevent Mongoose immutable field errors or logic collisions
        let { id, _id, memberId, ...updates } = req.body;

        // Explicitly set the ID for upsertMemberRecursive to perform an UPDATE, not CREATE
        updates._id = member._id.toString();

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
                _id: updates.spouseId || member.spouseId || undefined
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
        updates._id = mainId;

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
        await Member.findByIdAndDelete(req.params.id);
        
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
        const member = await Member.findById(memberId);

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
            const children = await Member.find({ fatherId: member._id });
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
            memberId: member._id
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
        // Check cache first
        const cached = cacheService.get(cacheService.KEYS.DASHBOARD_STATS);
        if (cached) {
            return res.json(cached);
        }

        // =====================================================
        // OPTIMIZED DASHBOARD AGGREGATION
        // =====================================================
        const Fund = require('../models/Fund');
        const Event = require('../models/Event');
        
        const now = new Date();
        const lastWeek = new Date(new Date().setDate(now.getDate() - 7));
        const today = new Date();

        // Defined Alive Filter (Strict: No Deceased, No Swa./Late prefix)
        const aliveQuery = { 
            $and: [
                { lifeStatus: { $ne: 'Deceased' } },
                { prefix: { $ne: 'स्व.' } },
                { prefix: { $not: /Late/i } },
                { prefix: { $not: /^Swa/i } }
            ]
        };

        // Execution
        const [
            // 1. Basic Counts (Alive Only for directory population)
            totalMembers,
            maleCount,
            femaleCount,
            marriedCount,
            singleMaleCount,
            singleFemaleCount,
            primaryMemberCount,
            
            // 2. Weekly Increments (Recent - Alive Only)
            newMembersLastWeek,
            newMalesLastWeek,
            newFemalesLastWeek,
            newMarriedLastWeek,
            
            // 3. Family Stats (Distinct families with at least one alive member)
            distinctFamilies,

            // 4. Complex Aggregations (Alive Only)
            educationByGender,
            ageDistribution,
            maritalStatusStats,
            districtDistribution,
            occupationDistribution,
            bloodGroupDistribution,
            genderRatioAge,
            
            // 5. Other Widget Data
            recentMembers,
            
            // 6. Existing Stats (Financials/Events unrelated to member life status)
            donationAgg,
            upcomingEvents
        ] = await Promise.all([
            // Basic Counts (ALIVE ONLY)
            Member.countDocuments(aliveQuery),
            Member.countDocuments({ ...aliveQuery, gender: 'Male' }),
            Member.countDocuments({ ...aliveQuery, gender: 'Female' }),
            Member.countDocuments({ ...aliveQuery, maritalStatus: 'Married' }),
            Member.countDocuments({ ...aliveQuery, gender: 'Male', maritalStatus: 'Single' }),
            Member.countDocuments({ ...aliveQuery, gender: 'Female', maritalStatus: 'Single' }),
            Member.countDocuments({ ...aliveQuery, isPrimary: true }),

            // Weekly Stats (ALIVE ONLY)
            Member.countDocuments({ ...aliveQuery, createdAt: { $gte: lastWeek } }),
            Member.countDocuments({ ...aliveQuery, gender: 'Male', createdAt: { $gte: lastWeek } }),
            Member.countDocuments({ ...aliveQuery, gender: 'Female', createdAt: { $gte: lastWeek } }),
            Member.countDocuments({ ...aliveQuery, maritalStatus: 'Married', createdAt: { $gte: lastWeek } }),

            // Distinct Families
            Member.aggregate([
                { $match: aliveQuery },
                { $group: { _id: "$familyId" } },
                { $count: "count" }
            ]).catch(() => []),

            // Education by Gender (ALIVE ONLY)
            Member.aggregate([
                { $match: { ...aliveQuery, education: { $exists: true, $ne: "" } } },
                {
                    $addFields: {
                        eduCategory: {
                            $switch: {
                                branches: [
                                   { case: { $regexMatch: { input: "$education", regex: /doctor|mbbs|phd|md|bams|bhms/i } }, then: "Doctor" },
                                   { case: { $regexMatch: { input: "$education", regex: /engineer|b\.?\s*e|b\.?\s*tech|m\.?\s*tech|diploma/i } }, then: "Engineer" },
                                   { case: { $regexMatch: { input: "$education", regex: /post.*graduate|master|m\.?\s*a|m\.?\s*sc|m\.?\s*com|mba|mca|pg/i } }, then: "Post Graduate" },
                                   { case: { $regexMatch: { input: "$education", regex: /graduate|bachelor|b\.?\s*a|b\.?\s*sc|b\.?\s*com|bca|bba/i } }, then: "Graduate" },
                                   { case: { $regexMatch: { input: "$education", regex: /12th|hsc|inter/i } }, then: "12th" },
                                   { case: { $regexMatch: { input: "$education", regex: /10th|ssc|matric/i } }, then: "10th" },
                                   { case: { $regexMatch: { input: "$education", regex: /[5-9]th|primary/i } }, then: "Primary (5th-9th)" }
                                ],
                                default: "Other"
                            }
                        }
                    }
                },
                {
                    $group: {
                        _id: "$eduCategory",
                        male: { $sum: { $cond: [{ $eq: ["$gender", "Male"] }, 1, 0] } },
                        female: { $sum: { $cond: [{ $eq: ["$gender", "Female"] }, 1, 0] } },
                        count: { $sum: 1 }
                    }
                }
            ]).catch(() => []),

            // Revised Age Distribution (ALIVE ONLY)
            Member.aggregate([
                { $match: { ...aliveQuery, dob: { $exists: true, $ne: null } } },
                {
                    $project: {
                        age: {
                            $floor: { $divide: [{ $subtract: [new Date(), "$dob"] }, 31536000000] }
                        }
                    }
                },
                {
                    $bucket: {
                        groupBy: "$age",
                        boundaries: [0, 11, 26, 36, 51], 
                        default: "51+",
                        output: { count: { $sum: 1 } }
                    }
                }
            ]).catch(() => []),

            // Marital Stats (ALIVE ONLY)
            Member.aggregate([
                { $match: aliveQuery },
                { $group: { _id: "$maritalStatus", count: { $sum: 1 } } }
            ]).catch(() => []),

            // District Distribution (ALIVE ONLY) - Use districtName for display
            Member.aggregate([
                { $match: { ...aliveQuery, districtName: { $exists: true, $ne: "" } } },
                { $group: { _id: "$districtName", count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 5 }
            ]).catch(() => []),

            // Occupation Distribution (ALIVE ONLY)
            Member.aggregate([
                { $match: { ...aliveQuery, occupationType: { $exists: true, $ne: "" } } },
                { $group: { _id: "$occupationType", count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]).catch(() => []),

            // Blood Group Distribution (ALIVE ONLY)
            Member.aggregate([
                { $match: { ...aliveQuery, blood_group: { $exists: true, $ne: "" } } },
                { $group: { _id: "$blood_group", count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]).catch(() => []),
            
            // Gender Ratio (Dummy/Empty placeholder as before)
            Promise.resolve([]), 

            // Recent Members (Alive Only)
            Member.find(aliveQuery)
                .sort({ createdAt: -1 })
                .limit(5)
                .select('firstName lastName memberId gender city maritalStatus dob photoUrl education phone')
                .lean(),

            // Financials
            Fund.aggregate([{ $group: { _id: null, totalAmount: { $sum: '$amount' }, count: { $sum: 1 } } }]).catch(() => []),
            Event.countDocuments({ date: { $gte: today } }).catch(() => 0)
        ]);

        // Process Data
        const stats = {
            counts: {
                total: totalMembers,
                primary: primaryMemberCount,
                male: maleCount,
                female: femaleCount,
                male: maleCount,
                female: femaleCount,
                married: marriedCount,
                singleMale: singleMaleCount,
                singleFemale: singleFemaleCount,
                families: distinctFamilies[0]?.count || 0,
                donationAmount: donationAgg[0]?.totalAmount || 0,
                weekly: {
                    total: newMembersLastWeek,
                    male: newMalesLastWeek,
                    female: newMalesLastWeek, // Approximation/Error fix: should be females
                    married: newMarriedLastWeek
                }
            },
            charts: {
                education: educationByGender.sort((a,b) => b.count - a.count),
                age: ageDistribution.sort((a,b) => (typeof a._id === 'number' ? a._id : 999) - (typeof b._id === 'number' ? b._id : 999)),
                marital: maritalStatusStats,
                districts: districtDistribution,
                occupations: occupationDistribution,
                bloodGroups: bloodGroupDistribution
            },
            widgets: {
                recentMembers: recentMembers || [],
                donations: donationAgg[0] || { totalAmount: 0, count: 0 },
                eventCount: upcomingEvents,
                invitations: [ // Mock Invitations
                    { id: 1, name: "Mahesh Patel", role: "Admin", status: "Sent", time: "2 mins ago" },
                    { id: 2, name: "Suresh Suthar", role: "Member", status: "Pending", time: "1 hour ago" },
                    { id: 3, name: "Anita Sharma", role: "Member", status: "Accepted", time: "5 hours ago" }
                ]
            }
        };
        
        // Fix typo in weekly females above (used male var)
        stats.counts.weekly.female = newFemalesLastWeek;

        // Cache the result for 5 minutes
        cacheService.set(cacheService.KEYS.DASHBOARD_STATS, stats, 300);

        res.json(stats);
    } catch (err) {
        console.error('Dashboard stats error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * PATCH /api/members/:id/matrimony-status
 * Update showOnMatrimony flag
 */
router.patch('/:id/matrimony-status', verifyToken, checkPermission('member.update'), async (req, res) => {
    try {
        const { showOnMatrimony } = req.body;
        
        const member = await Member.findByIdAndUpdate(
            req.params.id, 
            { 
                showOnMatrimony: showOnMatrimony
            }, 
            { new: true }
        );

        if (!member) {
            return res.status(404).json({ message: 'Member not found' });
        }

        res.json({ message: 'Matrimony status updated', member });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

/**
 * GET /api/members/eligible-relations
 * Returns members eligible for various relationship types
 */
router.get('/eligible-relations', verifyToken, checkPermission('member.view'), async (req, res) => {
    try {
        const { type, gender, excludeId, familyId } = req.query; // Added familyId
        let query = {};

        switch (type) {
            case 'father':
            case 'dada':
            case 'nana':
                query.gender = 'Male';
                break;
            case 'mother':
            case 'dadi':
            case 'nani':
                query.gender = 'Female';
                break;
            case 'spouse':
                query.gender = gender === 'Male' ? 'Female' : 'Male';
                break;
            case 'kaka':
            case 'mama':
            case 'fufa':
            case 'mausa':
            case 'jija':
            case 'saala':
                query.gender = 'Male';
                break;
            case 'kaki':
            case 'bua':
            case 'mami':
            case 'mausi':
            case 'saali':
                query.gender = 'Female';
                break;
        }

        if (excludeId) {
            query._id = { $ne: excludeId };
        }

        if (familyId && gender) { // Apply familyId and gender filter together
            query.$and = [
                { familyId: familyId },
                { gender: gender }
            ];
        } else if (familyId) { // Apply familyId if gender is not specified
            query.familyId = familyId;
        }


        const members = await Member.find(query)
            .select('_id memberId firstName middleName lastName gender dob maritalStatus city village geography')
            .sort({ firstName: 1 })
            .limit(200)
            .lean();

        res.json(members);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


/**
 * GET /api/members/by-pincode/:pincode
 * Geography-based search - Find members by pincode
 */
router.get('/by-pincode/:pincode', verifyToken, checkPermission('member.view'), async (req, res) => {
    try {
        const { pincode } = req.params;
        const { gender, marital_status, limit = 50 } = req.query;

        let query = {
            $or: [
                { 'geography.pincode': new RegExp(pincode, 'i') },
                { 'communication_info.address.pincode': new RegExp(pincode, 'i') },
                { 'address': new RegExp(pincode, 'i') } // Fallback for legacy data
            ]
        };

        // Add gender filter if provided
        if (gender) {
            query.gender = gender; // Use root field 'gender'
        }

        // Add marital status filter if provided
        if (marital_status) {
            query.maritalStatus = marital_status; // Use root field 'maritalStatus'
        }

        const members = await Member.find(query)
            .select('memberId firstName middleName lastName gender dob maritalStatus city village geography') // Removed personal_info, added root fields
            .limit(parseInt(limit))
            .sort({ firstName: 1, lastName: 1 }) // Sorting by root fields
            .lean();

        res.json(members);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/members/:id/siblings
 * Auto-detect siblings based on parental_union_id
 */
router.get('/:id/siblings', verifyToken, checkPermission('member.view'), async (req, res) => {
    try {
        const memberId = req.params.id;
        const member = await Member.findById(memberId);

        if (!member) {
            return res.status(404).json({ error: 'Member not found' });
        }

        const parentalUnionId = member.lineage_links?.parental_union_id;

        if (!parentalUnionId) {
            return res.json({ siblings: [], message: 'No parental union found' });
        }

        // Find all members with same parental_union_id (excluding self)
        const siblings = await Member.find({
            'lineage_links.parental_union_id': parentalUnionId,
            _id: { $ne: memberId }
        })
            .select('memberId firstName lastName gender dob')
            .lean();

        res.json({ siblings, parental_union_id: parentalUnionId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/members/search/maiden-name/:name
 * Search by maiden name (for married women)
 */
router.get('/search/maiden-name/:name', verifyToken, checkPermission('member.view'), async (req, res) => {
    try {
        const { name } = req.params;
        const { limit = 20 } = req.query;

        const members = await Member.find({
            maidenName: new RegExp(name, 'i')
        })
            .select('memberId geography firstName lastName')
            .limit(parseInt(limit))
            .lean();

        res.json(members);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// =========================================================
// HELPER: Auto-Create User for Primary Member
// =========================================================
async function ensureUserForPrimaryMember(member) {
    try {
        if (!member.isPrimary) return;

        // Check if user already exists linked to this member
        const existingUser = await User.findOne({ memberId: member.memberId });
        if (existingUser) {
            console.log(`[Auto-User] User already exists for Member ${member.memberId}`);
            return;
        }

        // Also check by username (Mobile) to prevent duplicates if manual user was created
        const mobileUsername = member.contact?.mobile?.trim();
        if (mobileUsername) {
            const userByMobile = await User.findOne({ username: mobileUsername });
            if (userByMobile) {
                console.log(`[Auto-User] User already exists with username ${mobileUsername}`);
                // Optional: Link this user to the member if not linked?
                if (!userByMobile.memberId) {
                    userByMobile.memberId = member.memberId;
                    await userByMobile.save();
                    console.log(`[Auto-User] Linked existing user ${mobileUsername} to Member ${member.memberId}`);
                }
                return;
            }
        }

        console.log(`[Auto-User] Creating new User for Primary Member ${member.memberId}...`);

        // Generate Credentials
        // Username: Mobile Number (preferred) or MemberID
        const username = mobileUsername || member.memberId;
        
        // Password: Mobile Number (default) or '123456' fallback
        // In production, maybe generate random and email it? For now, determinisitc for UX.
        const plainPassword = mobileUsername || '123456';
        
        const hashedPassword = await bcrypt.hash(plainPassword, 10);

        const newUser = new User({
            username: username,
            password: hashedPassword,
            name: member.fullName || `${member.firstName} ${member.lastName}`,
            email: member.contact?.email || undefined,
            mobile: member.contact?.mobile || undefined,
            memberId: member.memberId,
            role: 'Member', // Default Role
            isVerified: true, // Auto-verified since Admin created the member
            permissions: []
        });

        await newUser.save();
        console.log(`[Auto-User] Successfully created User for Member ${member.memberId} (Username: ${username})`);

    } catch (err) {
        console.error(`[Auto-User] Failed to create user for member ${member.memberId}:`, err);
        // Don't block the main flow, just log error
    }
}


