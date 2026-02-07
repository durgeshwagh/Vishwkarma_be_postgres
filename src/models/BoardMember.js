const mongoose = require('mongoose');

const BoardMemberSchema = new mongoose.Schema({
    year: { type: String, required: true }, // e.g. "2002" or "2002-2005"
    role: { type: String, required: true }, // e.g. "President"
    name: { type: String, required: true },
    description: { type: String }, // New field for bio/details
    memberId: { type: String }, // Optional link to Member ID (e.g. M2025001)
    photoUrl: { type: String },
    photoId: { type: String }, // Cloudinary Public ID
    contact: { type: String },
    city: { type: String },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
    timestamps: true
});

module.exports = mongoose.model('BoardMember', BoardMemberSchema);
