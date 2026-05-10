const User = require('./User');
const Member = require('./Member');
const Fund = require('./Fund');
const Event = require('./Event');
const Donation = require('./Donation');
const Notice = require('./Notice');
const BoardMember = require('./BoardMember');
const Union = require('./Union');
const Marriage = require('./Marriage');

// Define Associations
// Members -> Parents
Member.belongsTo(Member, { as: 'Father', foreignKey: 'fatherId' });
Member.belongsTo(Member, { as: 'Mother', foreignKey: 'motherId' });
Member.belongsTo(Member, { as: 'SpouseMember', foreignKey: 'spouseId' });

// Members -> Children (Hierarchical)
Member.hasMany(Member, { as: 'Children', foreignKey: 'fatherId', constraints: false });

// User -> Member (One-to-One)
User.belongsTo(Member, { foreignKey: 'memberId', targetKey: 'memberId', as: 'memberDetails' });
Member.hasOne(User, { foreignKey: 'memberId', sourceKey: 'memberId' });

// Marriages -> Members
Marriage.belongsTo(Member, { as: 'Husband', foreignKey: 'husbandId' });
Marriage.belongsTo(Member, { as: 'Wife', foreignKey: 'wifeId' });

// Unions -> Members
Union.belongsTo(Member, { as: 'HusbandUnion', foreignKey: 'husbandId' });
Union.belongsTo(Member, { as: 'WifeUnion', foreignKey: 'wifeId' });

// Funds -> Member
Fund.belongsTo(Member, { foreignKey: 'memberId' });
Member.hasMany(Fund, { foreignKey: 'memberId' });

module.exports = {
    User,
    Member,
    Fund,
    Event,
    Donation,
    Notice,
    BoardMember,
    Union,
    Marriage
};
