const mongoose = require('mongoose');

const MemberSchema = new mongoose.Schema({
    // ===============================
    // Core Identity
    // ===============================
    memberId: { type: String, required: true, unique: true, index: true },
    
    // ===============================
    // Personal Information (Flattened for Performance)
    // ===============================
    firstName: { type: String, required: true },
    middleName: { type: String },
    lastName: { type: String, required: true },
    fullName: { type: String, index: true }, // Pre-calculated: "First Middle Last"
    prefix: { type: String }, // श्री, सौ, श्रीमती, स्व.
    gender: { type: String, enum: ['Male', 'Female'], required: true, index: true },
    dob: { type: Date, required: true },
    lifeStatus: { type: String, enum: ['Alive', 'Deceased'], default: 'Alive' },
    maritalStatus: { type: String, enum: ['Single', 'Married', 'Divorced', 'Widowed'], index: true },
    maidenName: { type: String, index: true },
    
    contact: {
        mobile: { type: String, index: true },
        email: { type: String },
        whatsapp: { type: String }
    },

    education: { type: String },
    occupation: { type: String },
    occupationType: { type: String, enum: ['Job', 'Business', 'Farmer', 'Student', 'Housewife', 'Retired', 'Other', ''] },
    jobType: { type: String, enum: ['Software Engineer', 'Teacher', 'Government Employee', 'Private Company Employee', 'Doctor', 'Nurse', 'Accountant', 'Clerk', 'Security Guard', 'Driver', 'Other', ''] },
    photoUrl: { type: String },
    photoId: { type: String }, // Cloudinary Public ID
    showOnMatrimony: { type: Boolean, default: false },
    blood_group: { type: String },
    height: { type: String },
    hobbies: [{ type: String }],
    
    // ===============================
    // Geography (Indexed for Search)
    // ===============================
    city: { type: String, index: true }, // Syncs with taluka
    village: { type: String, index: true },
    state: { type: String, index: true },    // Added top-level index
    district: { type: String, index: true }, // Added top-level index
    taluka: { type: String, index: true },   // Added top-level index
    geography: {
        pincode: { type: Number },
        state: { type: String },
        district: { type: String },
        taluka: { type: String },
        village: { type: String },
        full_address: { type: String }
    },

    // ===============================
    // Relationships (Optimized Refs)
    // ===============================
    father: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', default: null },
    mother: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', default: null },
    spouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', default: null },
    children: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Member' }],
    
    // String MemberIds for easier frontend access (e.g., "M0001")
    fatherMemberId: { type: String, index: true },
    motherMemberId: { type: String, index: true },
    spouseMemberId: { type: String, index: true },

    // ===============================
    // Family Grouping & Linkage
    // ===============================
    familyId: { type: String, index: true },
    isPrimary: { type: Boolean, default: false },
    lineage_links: {
        parental_union_id: { type: String, index: true },
        immediate_relations: { type: Object },
        extended_network: { type: Object }
    },

    // ===============================
    // Verification & Metadata
    // ===============================
    verification: {
        status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
        verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        verifiedAt: { type: Date },
        rejectionReason: { type: String }
    },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // ===============================
    // Legacy Compatibility (Hidden/Internal)
    // ===============================
    personal_info: { type: Object } // Store old nested data if migration is pending
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    versionKey: false
});

// Virtual for age calculation
MemberSchema.virtual('age').get(function () {
    if (!this.dob) return null;
    return Math.floor((Date.now() - new Date(this.dob)) / (31557600000));
});

// Legacy Compatibility Virtuals (for frontend support)
MemberSchema.virtual('fatherId').get(function() { return this.father; });
MemberSchema.virtual('motherId').get(function() { return this.mother; });
MemberSchema.virtual('spouseId').get(function() { return this.spouse; });

// ---------------------------------------------------------
// PERFORMANCE INDEXES
// ---------------------------------------------------------

// Compound Index for List/Table Filtering (Primary Search Patterns)
MemberSchema.index({ familyId: 1, isPrimary: -1 });
MemberSchema.index({ lifeStatus: 1, gender: 1, maritalStatus: 1 });

// Compound Index for Geography Filtering
MemberSchema.index({ 'geography.state': 1, 'geography.district': 1, 'geography.taluka': 1 });
MemberSchema.index({ 'geography.pincode': 1 });

// Optimized Matrimony Search Index (Partial)
MemberSchema.index(
    { showOnMatrimony: 1, gender: 1, maritalStatus: 1 },
    { partialFilterExpression: { showOnMatrimony: true, lifeStatus: 'Alive' } }
);

// Indexes for relationship traversals (Recursive trees)
MemberSchema.index({ father: 1 });
MemberSchema.index({ mother: 1 });
MemberSchema.index({ spouse: 1 });

// Full-Text Search Index (For Global Search Bar)
MemberSchema.index({
    fullName: 'text',
    firstName: 'text',
    lastName: 'text',
    village: 'text',
    city: 'text',
    taluka: 'text',
    'contact.mobile': 'text',
    memberId: 'text'
}, {
    weights: {
        fullName: 15,
        firstName: 10,
        lastName: 10,
        memberId: 5,
        village: 3,
        city: 3,
        taluka: 3,
        'contact.mobile': 5
    },
    name: 'GlobalSearchIndex',
    default_language: 'none' // Improves support for non-English (Marathi) characters by not using a specific language's stop words/stemming
});

// Pre-save hook to ensure fullName and top-level geo fields are always accurate
MemberSchema.pre('save', async function() {
    if (this.firstName && this.lastName) {
        const p = this.prefix ? this.prefix + ' ' : '';
        const m = this.middleName ? this.middleName + ' ' : '';
        this.fullName = `${p}${this.firstName} ${m}${this.lastName}`.replace(/\s+/g, ' ').trim();
    }
    
    // Sync Geography shortcut fields
    if (this.geography) {
        if (!this.city) this.city = this.geography.taluka || this.geography.city;
        if (!this.village) this.village = this.geography.village;
    }
});

module.exports = mongoose.model('Member', MemberSchema);
