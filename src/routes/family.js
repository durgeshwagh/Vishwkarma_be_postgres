const express = require('express');
const router = express.Router();
const Member = require('../models/Member');
const Marriage = require('../models/Marriage');
const User = require('../models/User');
const { verifyToken } = require('../middleware/authMiddleware');
const { Op } = require('sequelize');

// Get my family members
router.get('/my-family', verifyToken, async (req, res) => {
    try {
        const memberId = req.user.memberId;
        if (!memberId) return res.status(400).json({ message: 'User is not linked to a member profile' });

        const currentMember = await Member.findOne({ where: { memberId } });
        if (!currentMember) return res.status(404).json({ message: 'Member profile not found' });

        let coreFamily = [];
        if (currentMember.familyId && currentMember.familyId !== 'Unassigned' && currentMember.familyId !== 'FNew') {
            coreFamily = await Member.findAll({ where: { familyId: currentMember.familyId } });
        } else {
            coreFamily = [currentMember];
        }

        const coreIds = coreFamily.map(m => m.id);

        const extendedRelatives = await Member.findAll({
            where: {
                familyId: { [Op.ne]: currentMember.familyId },
                [Op.or]: [
                    { fatherId: { [Op.in]: coreIds } },
                    { motherId: { [Op.in]: coreIds } }
                ]
            }
        });

        const allFoundIds = [...coreIds, ...extendedRelatives.map(m => m.id)];
        const marriages = await Marriage.findAll({
            where: {
                status: 'Active',
                [Op.or]: [
                    { husbandId: { [Op.in]: allFoundIds } },
                    { wifeId: { [Op.in]: allFoundIds } }
                ]
            }
        });

        const spouseIds = [];
        marriages.forEach(m => {
            spouseIds.push(m.husbandId);
            spouseIds.push(m.wifeId);
        });

        const knownIdSet = new Set(allFoundIds);
        const uniqueSpouseIds = [...new Set(spouseIds)].filter(id => !knownIdSet.has(id));
        const spouses = await Member.findAll({ where: { id: { [Op.in]: uniqueSpouseIds } } });

        const allMembers = [...coreFamily, ...extendedRelatives, ...spouses];
        const memberMap = new Map();
        allMembers.forEach(m => {
            const obj = m.toJSON();
            memberMap.set(obj.id, obj);
        });

        marriages.forEach(m => {
            const h = memberMap.get(m.husbandId);
            const w = memberMap.get(m.wifeId);
            if (h && w) {
                h.spouseId = w.id;
                w.spouseId = h.id;
            }
        });

        const familyData = await Promise.all(Array.from(memberMap.values()).map(async (member) => {
            const user = await User.findOne({ 
                where: { memberId: member.memberId },
                attributes: ['username', 'role', 'permissions', 'isVerified']
            });
            return { member, user: user ? user.toJSON() : null };
        }));

        res.json({
            familyId: currentMember.familyId,
            isPrimary: currentMember.isPrimary,
            members: familyData
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Tree Data for visualization
router.get('/tree-data/:memberId', verifyToken, async (req, res) => {
    try {
        const { memberId } = req.params;
        let targetMember = await Member.findOne({
            where: { [Op.or]: [{ id: memberId }, { memberId: memberId }] }
        });

        if (!targetMember) return res.status(404).json({ message: 'Member not found' });

        let coreFamily = [];
        if (targetMember.familyId && targetMember.familyId !== 'Unassigned' && targetMember.familyId !== 'FNew') {
            coreFamily = await Member.findAll({ where: { familyId: targetMember.familyId } });
        } else {
            coreFamily = [targetMember];
        }

        const coreIds = coreFamily.map(m => m.id);
        const descendants = await Member.findAll({
            where: {
                familyId: { [Op.ne]: targetMember.familyId },
                [Op.or]: [{ fatherId: { [Op.in]: coreIds } }, { motherId: { [Op.in]: coreIds } }]
            }
        });

        const ancestorIds = [];
        if (targetMember.fatherId) ancestorIds.push(targetMember.fatherId);
        if (targetMember.motherId) ancestorIds.push(targetMember.motherId);
        const ancestors = await Member.findAll({ where: { id: { [Op.in]: ancestorIds } } });

        const allSubjectIds = [...coreIds, ...descendants.map(m => m.id), ...ancestors.map(m => m.id)];
        const marriages = await Marriage.findAll({
            where: {
                status: 'Active',
                [Op.or]: [{ husbandId: { [Op.in]: allSubjectIds } }, { wifeId: { [Op.in]: allSubjectIds } }]
            }
        });

        const spouseIds = marriages.map(m => [m.husbandId, m.wifeId]).flat();
        const knownIds = new Set(allSubjectIds);
        const externalSpouses = await Member.findAll({
            where: { id: { [Op.in]: [...new Set(spouseIds)].filter(id => !knownIds.has(id)) } }
        });

        const allMembers = [...coreFamily, ...descendants, ...ancestors, ...externalSpouses];
        const memberMap = new Map();
        allMembers.forEach(m => {
            const obj = m.toJSON();
            memberMap.set(obj.id, obj);
        });

        marriages.forEach(m => {
            const h = memberMap.get(m.husbandId);
            const w = memberMap.get(m.wifeId);
            if (h && w) {
                h.spouseId = w.id;
                w.spouseId = h.id;
            }
        });

        res.json(Array.from(memberMap.values()).map(m => ({
            ...m,
            fatherId: m.fatherId,
            motherId: m.motherId
        })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
