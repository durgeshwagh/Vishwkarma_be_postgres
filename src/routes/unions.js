const express = require('express');
const router = express.Router();
const Union = require('../models/Union');
const Member = require('../models/Member');
const { verifyToken, checkPermission } = require('../middleware/authMiddleware');
const { Op } = require('sequelize');

async function generateUnionId() {
    const count = await Union.count();
    return `UNION_${(count + 1).toString().padStart(4, '0')}`;
}

// Create a new union
router.post('/', verifyToken, checkPermission('member.create'), async (req, res) => {
    try {
        const { husband_id, wife_id, marriage_date, marriage_place, children_ids } = req.body;
        const husband = await Member.findByPk(husband_id);
        const wife = await Member.findByPk(wife_id);

        if (!husband || !wife) return res.status(404).json({ error: 'Husband or Wife not found' });
        if (husband.gender !== 'Male' || wife.gender !== 'Female') return res.status(400).json({ error: 'Invalid gender combination' });

        const unionId = await generateUnionId();
        const newUnion = await Union.create({
            unionId,
            husbandId: husband_id,
            wifeId: wife_id,
            marriageDate: marriage_date,
            marriagePlace: marriage_place,
            childrenIds: children_ids || [],
            unionType: 'marriage',
            createdBy: req.user.id
        });
        res.status(201).json(newUnion);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get union details
router.get('/:id', verifyToken, checkPermission('member.view'), async (req, res) => {
    try {
        const union = await Union.findByPk(req.params.id);
        if (!union) return res.status(404).json({ error: 'Union not found' });
        res.json(union);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Add a child
router.post('/:id/add-child', verifyToken, checkPermission('member.edit'), async (req, res) => {
    try {
        const { child_id } = req.body;
        const union = await Union.findByPk(req.params.id);
        if (!union) return res.status(404).json({ error: 'Union not found' });

        const children = [...union.childrenIds];
        if (!children.includes(child_id)) {
            children.push(child_id);
            await union.update({ childrenIds: children });
            
            // Relational link: Update child's father/mother based on union
            await Member.update({
                father_id: union.husbandId,
                mother_id: union.wifeId
            }, { where: { id: child_id } });
        }
        res.json({ message: 'Child added successfully', union });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Pending verifications
router.get('/pending', verifyToken, checkPermission('admin.view'), async (req, res) => {
    try {
        const pending = await Union.findAll({ where: { verificationStatus: 'Pending' }, order: [['createdAt', 'DESC']] });
        res.json(pending);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
