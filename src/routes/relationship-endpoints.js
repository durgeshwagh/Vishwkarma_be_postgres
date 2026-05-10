const express = require('express');
const router = express.Router();
const { Member } = require('../models');
const { verifyToken, checkPermission } = require('../middleware/authMiddleware');
const { Op } = require('sequelize');

// Eligible Relations (simplified version for relational schema)
router.get('/eligible-relations', verifyToken, checkPermission('member.view'), async (req, res) => {
    try {
        const { type, gender, excludeId } = req.query;
        let where = {};

        switch (type) {
            case 'father':
            case 'dada':
            case 'nana':
                where.gender = 'Male';
                break;
            case 'mother':
            case 'dadi':
            case 'nani':
                where.gender = 'Female';
                break;
            case 'spouse':
                where.gender = gender === 'Male' ? 'Female' : 'Male';
                where.maritalStatus = { [Op.in]: ['Single', 'Married'] };
                break;
            default:
                if (gender) where.gender = gender;
        }

        if (excludeId) where.id = { [Op.ne]: excludeId };

        const members = await Member.findAll({
            where,
            attributes: ['id', 'memberId', 'firstName', 'middleName', 'lastName', 'gender', 'dob', 'maritalStatus', 'city', 'village'],
            order: [['firstName', 'ASC']],
            limit: 200
        });

        res.json(members);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Family Network (adapted for new schema)
router.get('/:id/family-network', verifyToken, checkPermission('member.view'), async (req, res) => {
    try {
        const member = await Member.findByPk(req.params.id, {
            include: [
                { model: Member, as: 'Father' },
                { model: Member, as: 'Mother' },
                { model: Member, as: 'SpouseMember' }
            ]
        });

        if (!member) return res.status(404).json({ message: 'Member not found' });

        // Fetch children
        const children = await Member.findAll({
            where: { [Op.or]: [{ fatherId: member.id }, { motherId: member.id }] }
        });

        res.json({
            member: { id: member.id, name: `${member.firstName} ${member.lastName}`, memberId: member.memberId },
            immediate_relations: {
                father: member.Father,
                mother: member.Mother,
                spouse: member.SpouseMember,
                children: children
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
