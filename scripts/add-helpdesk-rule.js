require('dotenv').config();
const mongoose = require('mongoose');
const Group = require('../src/models/Group');

async function addHelpdeskRule() {
  await mongoose.connect(process.env.MONGODB_URI);

  const groups = await Group.find({});
  for (const group of groups) {
    const hasRule = group.monitoringRules.some(
      rule => rule.pattern === '#helpdesk\\b'
    );
    if (!hasRule) {
      group.monitoringRules.push({
        pattern: '#helpdesk\\b',
        type: 'HELPDESK',
        actions: [],
        isActive: true
      });
      await group.save();
      console.log(`Updated group: ${group.groupId}`);
    }
  }
  console.log('Done.');
  process.exit(0);
}

async function updateHelpdeskEmail() {
  await mongoose.connect(process.env.MONGODB_URI);
  const groups = await Group.find({ 'monitoringRules.actions.type': 'EMAIL' });
  for (const group of groups) {
    let updated = false;
    for (const rule of group.monitoringRules) {
      for (const action of rule.actions) {
        if (action.type === 'EMAIL') {
          action.config.set('to', process.env.HELPDESK_EMAIL);
          updated = true;
        }
      }
    }
    if (updated) await group.save();
  }
  console.log('All EMAIL actions updated to use HELPESK_EMAIL from .env');
  process.exit(0);
}

addHelpdeskRule(); 
updateHelpdeskEmail(); 