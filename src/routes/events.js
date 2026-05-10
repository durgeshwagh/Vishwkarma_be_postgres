const express = require('express');
const router = express.Router();
const Event = require('../models/Event');
const { verifyToken, checkPermission } = require('../middleware/authMiddleware');
const { upload } = require('../config/cloudinary');

// Get all events
router.get('/', async (req, res) => {
    try {
        const events = await Event.findAll({ order: [['date', 'ASC']] });
        res.json(events);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create an event
router.post('/', verifyToken, checkPermission('events.manage'), upload.single('media'), async (req, res) => {
    try {
        const data = { ...req.body };
        if (req.file) {
            if (req.body.mediaType === 'Video') {
                data.videoUrl = req.file.path;
                data.videoId = req.file.filename;
            } else {
                data.imageUrl = req.file.path;
                data.imageId = req.file.filename;
            }
        }
        const newEvent = await Event.create(data);
        res.status(201).json(newEvent);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get event by ID
router.get('/:id', async (req, res) => {
    try {
        const event = await Event.findByPk(req.params.id);
        if (!event) return res.status(404).json({ message: 'Event not found' });
        res.json(event);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update event
router.put('/:id', verifyToken, checkPermission('events.manage'), upload.single('media'), async (req, res) => {
    try {
        const event = await Event.findByPk(req.params.id);
        if (!event) return res.status(404).json({ message: 'Event not found' });

        const data = { ...req.body };
        if (req.file) {
            if (req.body.mediaType === 'Video') {
                data.videoUrl = req.file.path;
                data.videoId = req.file.filename;
                data.imageUrl = null;
                data.imageId = null;
            } else {
                data.imageUrl = req.file.path;
                data.imageId = req.file.filename;
                data.videoUrl = null;
                data.videoId = null;
            }
        }
        await event.update(data);
        res.json(event);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete event
router.delete('/:id', verifyToken, checkPermission('events.manage'), async (req, res) => {
    try {
        const deleted = await Event.destroy({ where: { id: req.params.id } });
        if (!deleted) return res.status(404).json({ message: 'Event not found' });
        res.json({ message: 'Event deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
