const schoolList = require('./schoolNames');
const logger = require('./logger');

/**
 * Extracts a school name and city from a WhatsApp group name using exact and alias matching.
 * @param {string} groupName The WhatsApp group name
 * @returns {{school: string, city: string}} The extracted school and city, or Unknown if not found
 */
function extractSchoolName(groupName) {
  if (!groupName) {
    logger.warn('extractSchoolName called with empty or null groupName');
    return { school: "Unknown School", city: "Unknown City" };
  }
  
  logger.debug(`Attempting to extract school name from group: '${groupName}'`);
  const groupNameLower = groupName.toLowerCase().trim();

  // 1. Try to match with SR prefix pattern (most common format)
  const srPrefixMatch = groupName.match(/SR\s*-\s*(.*?)(?:\s*-|$)/i);
  if (srPrefixMatch && srPrefixMatch[1] && srPrefixMatch[1].trim().length > 2) {
    const schoolName = srPrefixMatch[1].trim();
    logger.debug(`School name extracted from SR prefix: '${schoolName}' in group name '${groupName}'`);
    return { school: schoolName, city: "Unknown City" };
  }

  // 2. Exact match (case-insensitive)
  for (const school of schoolList) {
    if (groupNameLower.includes(school.name.toLowerCase())) {
      logger.debug(`School name matched exactly: '${school.name}' in group name '${groupName}'`);
      return { school: school.name, city: school.city || "Unknown City" };
    }
  }

  // 3. Alias match (case-insensitive, partial)
  for (const school of schoolList) {
    for (const alias of school.aliases || []) {
      if (alias && groupNameLower.includes(alias.toLowerCase())) {
        logger.debug(`School name matched by alias: '${school.name}' (alias: '${alias}') in group name '${groupName}'`);
        return { school: school.name, city: school.city || "Unknown City" };
      }
    }
  }

  // 4. Try to extract school name from other common patterns
  // Pattern: "School Name - SR"
  const schoolSrPattern = groupName.match(/(.*?)\s*-\s*SR(?:\s*-|$)/i);
  if (schoolSrPattern && schoolSrPattern[1] && schoolSrPattern[1].trim().length > 2) {
    const schoolName = schoolSrPattern[1].trim();
    logger.debug(`School name extracted from 'School - SR' pattern: '${schoolName}' in group name '${groupName}'`);
    return { school: schoolName, city: "Unknown City" };
  }
  
  // Pattern: "School Name (something)"
  const schoolParenthesisPattern = groupName.match(/^([^(]+)(?:\s*\(.*\))?$/i);
  if (schoolParenthesisPattern && schoolParenthesisPattern[1] && schoolParenthesisPattern[1].trim().length > 2) {
    const schoolName = schoolParenthesisPattern[1].trim();
    logger.debug(`School name extracted from 'School (info)' pattern: '${schoolName}' in group name '${groupName}'`);
    return { school: schoolName, city: "Unknown City" };
  }

  // If group name contains "school" or "academy" keyword, use the whole name
  if (groupNameLower.includes('school') || groupNameLower.includes('academy') || 
      groupNameLower.includes('college') || groupNameLower.includes('vidyalaya')) {
    logger.debug(`School name extracted from education keyword: '${groupName}' in group name '${groupName}'`);
    return { school: groupName, city: "Unknown City" };
  }

  logger.warn(`No school name matched for group name: '${groupName}'`);
  // Last resort: If group name is short and likely a school name, use it as is
  if (groupName.length < 30 && !groupName.includes('http') && !groupName.includes('www.')) {
    logger.debug(`Using group name as school name (fallback): '${groupName}'`);
    return { school: groupName, city: "Unknown City" };
  }
  
  return { school: "Unknown School", city: "Unknown City" };
}

/**
 * Generates a unique identifier for emails to prevent threading
 * 
 * @returns {string} A unique ID based on timestamp and random numbers
 */
function generateUniqueEmailId() {
  return `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

/**
 * Formats an email subject with school name and unique ID to prevent threading
 * 
 * @param {string|object} schoolName School name to include in subject (can be string or {school, city} object)
 * @param {string} messageType Type of message/notification
 * @returns {string} Formatted email subject
 */
function formatEmailSubject(schoolName, messageType = "Notification") {
  const uniqueId = generateUniqueEmailId();
  const schoolNameStr = typeof schoolName === 'object' ? schoolName.school : schoolName;
  return `${schoolNameStr} - ${messageType} #${uniqueId}`;
}

module.exports = {
  extractSchoolName,
  generateUniqueEmailId,
  formatEmailSubject
}; 