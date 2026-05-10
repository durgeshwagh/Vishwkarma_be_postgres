const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Union = sequelize.define('Union', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    unionId: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false,
        field: 'union_id'
    },
    husbandId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'husband_id'
    },
    wifeId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'wife_id'
    },
    marriageDate: {
        type: DataTypes.DATE,
        field: 'marriage_date'
    },
    marriagePlace: {
        type: DataTypes.STRING,
        field: 'marriage_place'
    },
    unionType: {
        type: DataTypes.ENUM('birth_family', 'marriage'),
        defaultValue: 'marriage',
        field: 'union_type'
    },
    childrenIds: {
        type: DataTypes.JSONB,
        defaultValue: [],
        field: 'children_ids'
    },
    status: {
        type: DataTypes.ENUM('Active', 'Divorced', 'Deceased', 'Separated'),
        defaultValue: 'Active'
    },
    verificationStatus: {
        type: DataTypes.ENUM('Pending', 'Approved', 'Rejected'),
        defaultValue: 'Pending',
        field: 'verification_status'
    },
    isVerified: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'is_verified'
    },
    verifiedBy: {
        type: DataTypes.UUID,
        field: 'verified_by'
    },
    verifiedAt: {
        type: DataTypes.DATE,
        field: 'verified_at'
    },
    rejectionReason: {
        type: DataTypes.STRING,
        field: 'rejection_reason'
    },
    createdBy: {
        type: DataTypes.UUID,
        field: 'created_by'
    }
}, {
    tableName: 'unions',
    timestamps: true,
    underscored: true,
    indexes: [
        { fields: ['husband_id'] },
        { fields: ['wife_id'] },
        { fields: ['verification_status'] },
        { fields: ['union_type'] }
    ]
});

module.exports = Union;
