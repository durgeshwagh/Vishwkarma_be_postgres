const mongoose = require('mongoose');

const EventSchema = new mongoose.Schema({
    title: { type: String, required: true },
    date: { type: Date, required: true },
    location: { type: String, required: true },
    description: { type: String },
    imageUrl: { type: String },
    imageId: { type: String }, // Cloudinary Public ID (Image)
    videoUrl: { type: String },
    videoId: { type: String }, // Cloudinary Public ID (Video)
    mediaType: { type: String, enum: ['Image', 'Video'], default: 'Image' },
    organizer: { type: String }
}, {
    timestamps: true
});

module.exports = mongoose.model('Event', EventSchema);
