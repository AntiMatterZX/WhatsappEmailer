/**
 * Generates HTML email content based on the given parameters
 * @param {Object} params Email parameters
 * @param {string} params.schoolName School name
 * @param {string} params.groupName Group name
 * @param {string} params.sender Message sender
 * @param {string} params.content Message content
 * @param {Date} params.timestamp Message timestamp
 * @param {string} params.uniqueId Unique message ID
 * @param {Array} params.attachments Array of attachment file names (optional)
 * @returns {string} HTML email content
 */
function generateEmailTemplate(params) {
  const {
    schoolName,
    groupName,
    sender,
    content,
    timestamp,
    uniqueId,
    attachments = []
  } = params;

  // Format the time
  const formattedTime = timestamp instanceof Date 
    ? timestamp.toLocaleString() 
    : new Date(timestamp).toLocaleString();

  // Generate attachment HTML if there are attachments
  let attachmentsHtml = '';
  if (attachments && attachments.length > 0) {
    attachmentsHtml = `
      <div style="margin-top: 20px; padding: 15px; background-color: #fff8e1; border-radius: 6px; border-left: 4px solid #ffc107;">
        <h3 style="margin-top: 0; color: #ff9800;">Attachments:</h3>
        <ul style="list-style-type: none; padding-left: 5px;">
          ${attachments.map(attachment => `
            <li style="margin-bottom: 8px;">
              <img src="https://cdn-icons-png.flaticon.com/512/2965/2965335.png" 
                  alt="attachment" width="16" height="16" style="vertical-align: middle; margin-right: 5px;">
              ${attachment}
            </li>
          `).join('')}
        </ul>
        <p style="font-size: 12px; color: #666; margin-top: 10px; font-style: italic;">
          The attachments are included with this email.
        </p>
      </div>
    `;
  }

  // Generate the HTML
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${schoolName} - Notification</title>
      </head>
      <body style="font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f7f7f7;">
        <div style="max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden; background-color: white;">
          
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #6a5acd, #4169e1); color: white; padding: 20px; text-align: center;">
            <img src="https://elasticbeanstalk-ap-south-1-954976323838.s3.ap-south-1.amazonaws.com/varun/stemrobo-final1+(1).png" 
                alt="STEMROBO Logo" width="220" style="display: block; margin: 0 auto;">
            <h2 style="margin-top: 15px; margin-bottom: 0;">${schoolName} - Notification</h2>
          </div>
          
          <!-- Content -->
          <div style="padding: 20px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tbody>
                <tr>
                  <td style="padding: 8px; border-bottom: 1px solid #e0e0e0; font-weight: bold; width: 100px;">School:</td>
                  <td style="padding: 8px; border-bottom: 1px solid #e0e0e0;">${schoolName}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; border-bottom: 1px solid #e0e0e0; font-weight: bold;">Group:</td>
                  <td style="padding: 8px; border-bottom: 1px solid #e0e0e0;">${groupName || "Unknown"}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; border-bottom: 1px solid #e0e0e0; font-weight: bold;">Sender:</td>
                  <td style="padding: 8px; border-bottom: 1px solid #e0e0e0;">${sender || "Unknown"}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; border-bottom: 1px solid #e0e0e0; font-weight: bold;">Time:</td>
                  <td style="padding: 8px; border-bottom: 1px solid #e0e0e0;">${formattedTime}</td>
                </tr>
              </tbody>
            </table>
            
            <!-- Message Content -->
            <div style="margin-top: 20px; padding: 15px; background-color: #f9f9f9; border-radius: 6px;">
              <h3 style="margin-top: 0; color: #4169e1;">Message:</h3>
              <div>${content || ""}</div>
            </div>
            
            <!-- Attachments Section -->
            ${attachmentsHtml}
          </div>
          
          <!-- Footer -->
          <div style="background-color: #f0f7ff; padding: 15px; text-align: center; font-size: 14px; color: #666;">
            <p>This is an automated message from the WhatsApp Bot system.</p>
            <p>ID: ${uniqueId}</p>
          </div>
        </div>
      </body>
    </html>
  `;
}

module.exports = generateEmailTemplate; 