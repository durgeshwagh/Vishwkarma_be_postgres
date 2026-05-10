const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    username: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    password: {
        type: DataTypes.STRING,
        allowNull: false
    },
    email: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: true
    },
    mobile: {
        type: DataTypes.STRING
    },
    role: {
        type: DataTypes.STRING,
        defaultValue: 'Member',
        validate: {
            isIn: [['SuperAdmin', 'Admin', 'Member']]
        }
    },
    isVerified: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'is_verified'
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        field: 'is_active'
    },
    permissions: {
        type: DataTypes.TEXT,
        get() {
            const val = this.getDataValue('permissions');
            return val ? JSON.parse(val) : [];
        },
        set(val) {
            this.setDataValue('permissions', JSON.stringify(val || []));
        }
    },
    otp: {
        type: DataTypes.STRING,
        allowNull: true
    },
    otpExpires: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'otp_expires'
    },
    name: {
        type: DataTypes.STRING
    },
    memberId: {
        type: DataTypes.STRING,
        field: 'member_id'
    }
}, {
    tableName: 'users',
    timestamps: true,
    underscored: true
});

module.exports = User;
