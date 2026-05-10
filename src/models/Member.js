const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Member = sequelize.define('Member', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    memberId: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false,
        field: 'member_id'
    },
    firstName: {
        type: DataTypes.STRING,
        allowNull: false,
        field: 'first_name'
    },
    middleName: {
        type: DataTypes.STRING,
        field: 'middle_name'
    },
    lastName: {
        type: DataTypes.STRING,
        allowNull: false,
        field: 'last_name'
    },
    fullName: {
        type: DataTypes.STRING,
        field: 'full_name'
    },
    prefix: {
        type: DataTypes.STRING
    },
    gender: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
            isIn: [['Male', 'Female']]
        }
    },
    dob: {
        type: DataTypes.DATE,
        allowNull: false
    },
    lifeStatus: {
        type: DataTypes.STRING,
        defaultValue: 'Alive',
        field: 'life_status',
        validate: {
            isIn: [['Alive', 'Deceased']]
        }
    },
    maritalStatus: {
        type: DataTypes.STRING,
        field: 'marital_status',
        validate: {
            isIn: [['Single', 'Married', 'Divorced', 'Widowed']]
        }
    },
    maidenName: {
        type: DataTypes.STRING,
        field: 'maiden_name'
    },
    contact: {
        type: DataTypes.TEXT,
        get() {
            const val = this.getDataValue('contact');
            return val ? JSON.parse(val) : {};
        },
        set(val) {
            this.setDataValue('contact', JSON.stringify(val || {}));
        }
    },
    geography: {
        type: DataTypes.TEXT,
        get() {
            const val = this.getDataValue('geography');
            return val ? JSON.parse(val) : {};
        },
        set(val) {
            this.setDataValue('geography', JSON.stringify(val || {}));
        }
    },
    education: { type: DataTypes.STRING },
    occupation: { type: DataTypes.STRING },
    occupationType: { type: DataTypes.STRING, field: 'occupation_type' },
    jobType: { type: DataTypes.STRING, field: 'job_type' },
    photoUrl: { type: DataTypes.STRING, field: 'photo_url' },
    photoId: { type: DataTypes.STRING, field: 'photo_id' },
    showOnMatrimony: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'show_on_matrimony' },
    bloodGroup: { type: DataTypes.STRING, field: 'blood_group' },
    height: { type: DataTypes.STRING },
    hobbies: { 
        type: DataTypes.TEXT,
        get() {
            const val = this.getDataValue('hobbies');
            return val ? JSON.parse(val) : [];
        },
        set(val) {
            this.setDataValue('hobbies', JSON.stringify(val || []));
        }
    },
    
    // Geographical shortcuts (for faster lookups)
    city: { type: DataTypes.STRING },
    village: { type: DataTypes.STRING },
    state: { type: DataTypes.STRING },
    district: { type: DataTypes.STRING },
    taluka: { type: DataTypes.STRING },

    // Relationships
    fatherMemberId: { type: DataTypes.STRING, field: 'father_member_id' },
    motherMemberId: { type: DataTypes.STRING, field: 'mother_member_id' },
    spouseMemberId: { type: DataTypes.STRING, field: 'spouse_member_id' },

    // Actual Foreign Keys (UUIDs)
    fatherId: { type: DataTypes.UUID, field: 'father_id' },
    motherId: { type: DataTypes.UUID, field: 'mother_id' },
    spouseId: { type: DataTypes.UUID, field: 'spouse' }, // spouse field stores the ID of the spouse member

    familyId: { type: DataTypes.STRING, field: 'family_id' },
    isPrimary: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'is_primary' },
    
    verificationStatus: {
        type: DataTypes.STRING,
        defaultValue: 'Pending',
        field: 'verification_status',
        validate: {
            isIn: [['Pending', 'Approved', 'Rejected']]
        }
    },
    verifiedAt: { type: DataTypes.DATE, field: 'verified_at' },
    rejectionReason: { type: DataTypes.STRING, field: 'rejection_reason' },

    // Virtuals for Frontend Compatibility
    age: {
        type: DataTypes.VIRTUAL,
        get() {
            if (!this.dob) return null;
            return Math.floor((Date.now() - new Date(this.dob)) / (31557600000));
        }
    },
    // No virtuals needed for IDs as they are now standardized attributes
}, {
    tableName: 'members',
    timestamps: true,
    underscored: true
});

// Hooks for calculated fields
Member.beforeSave((member) => {
    if (member.firstName && member.lastName) {
        const p = member.prefix ? member.prefix + ' ' : '';
        const m = member.middleName ? member.middleName + ' ' : '';
        member.fullName = `${p}${member.firstName} ${m}${member.lastName}`.replace(/\s+/g, ' ').trim();
    }
    
    // Sync Geography shortcuts
    if (member.geography) {
        if (!member.city) member.city = member.geography.taluka || member.geography.city;
        if (!member.village) member.village = member.geography.village;
        if (!member.state) member.state = member.geography.state;
        if (!member.district) member.district = member.geography.district;
        if (!member.taluka) member.taluka = member.geography.taluka;
    }
});

module.exports = Member;
