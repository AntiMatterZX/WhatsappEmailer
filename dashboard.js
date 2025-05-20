/**
 * Dashboard page JavaScript for WhatsApp Bot Admin
 */

// Cache DOM elements
let statusBadge, statusMessage, connectionDetails, connectionProgress;
let qrCode, connectBtn, disconnectBtn, restartBtn;
let refreshConnection;

// Initialize status polling variables
let statusPolling = null;
let statusPollInterval = 5000; // 5 seconds
let isQrDisplayed = false;
let lastStatus = null;

// Initialize the page when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  // Cache DOM elements
  statusBadge = document.getElementById('statusBadge');
  statusMessage = document.getElementById('statusMessage');
  connectionDetails = document.getElementById('connectionDetails');
  connectionProgress = document.getElementById('connectionProgress');
  qrCode = document.getElementById('qrCode');
  connectBtn = document.getElementById('connectBtn');
  disconnectBtn = document.getElementById('disconnectBtn');
  restartBtn = document.getElementById('restartClient');
  refreshConnection = document.getElementById('refreshConnection');
  
  // Initialize dashboard data
  fetchDashboardData();
  
  // Set up event listeners - attach just once at initialization
  if (refreshConnection) {
    refreshConnection.addEventListener('click', checkWhatsAppStatus);
  }
  
  if (document.getElementById('clearCache')) {
    document.getElementById('clearCache').addEventListener('click', clearCache);
  }
  
  if (document.getElementById('liveLogToggle')) {
    document.getElementById('liveLogToggle').addEventListener('click', toggleLiveLogs);
  }
  
  // Add WhatsApp connection button event listeners
  if (connectBtn) {
    connectBtn.addEventListener('click', connectWhatsApp);
  }
  
  if (disconnectBtn) {
    disconnectBtn.addEventListener('click', disconnectWhatsApp);
  }
  
  if (restartBtn) {
    restartBtn.addEventListener('click', restartWhatsAppClient);
  }
  
  // Fetch initial data
  checkWhatsAppStatus();
  
  // Start status polling
  startStatusPolling();
  
  // Fetch recent logs
  if (document.getElementById('recentLogsBody')) {
    fetchRecentLogs();
  }
});

/**
 * Start polling for WhatsApp status
 */
function startStatusPolling() {
  if (statusPolling !== null) {
    clearInterval(statusPolling);
  }
  
  statusPolling = setInterval(checkWhatsAppStatus, statusPollInterval);
  console.log('WhatsApp status polling started');
}

/**
 * Stop polling for WhatsApp status
 */
function stopStatusPolling() {
  if (statusPolling !== null) {
    clearInterval(statusPolling);
    statusPolling = null;
    console.log('WhatsApp status polling stopped');
  }
}

/**
 * Check WhatsApp connection status
 */
async function checkWhatsAppStatus() {
  if (!statusBadge || !statusMessage || !connectionDetails || !qrCode || !connectionProgress) {
    console.error('Required DOM elements not found for WhatsApp status check');
    return;
  }
  
  try {
    // Only show loading state if this is the first check
    if (!lastStatus) {
      statusBadge.className = 'status-badge status-unknown me-3';
      statusBadge.innerHTML = '<i class="bi bi-arrow-repeat"></i>';
      statusMessage.textContent = 'Checking WhatsApp connection status...';
      connectionProgress.style.width = '30%';
      connectionProgress.className = 'progress-bar bg-info';
    }
    
    const response = await fetch('/api/whatsapp/status');
    const data = await response.json();
    
    // Update progress
    connectionProgress.style.width = '100%';
    setTimeout(() => {
      connectionProgress.style.width = '0%';
    }, 1000);
    
    // Check if status changed
    const statusChanged = !lastStatus || 
                          lastStatus.state !== data.state || 
                          lastStatus.connected !== data.connected;
    
    // Update cached status
    lastStatus = data;
    
    // Reset button states - only if all buttons exist
    if (connectBtn && disconnectBtn && restartBtn) {
      connectBtn.classList.add('d-none');
      disconnectBtn.classList.add('d-none');
      restartBtn.classList.add('d-none');
    }
    
    // Handle QR code visibility to prevent flickering
    if (data.qrCode) {
      // Only update QR code if it changed or wasn't displayed before
      if (!isQrDisplayed || (qrCode.innerHTML !== data.qrCode)) {
        qrCode.innerHTML = data.qrCode;
        qrCode.classList.remove('d-none');
        isQrDisplayed = true;
      }
    } else {
      // Only hide QR if it was displayed and the new status doesn't have a QR
      if (isQrDisplayed) {
        qrCode.classList.add('d-none');
        qrCode.innerHTML = '';
        isQrDisplayed = false;
      }
    }
    
    // Only update UI elements if status changed
    if (statusChanged) {
      updateWhatsAppStatusUI(data);
    }
    
  } catch (error) {
    console.error('Error checking WhatsApp status:', error);
    
    // Set error state
    statusBadge.className = 'status-badge status-disconnected me-3';
    statusBadge.innerHTML = '<i class="bi bi-exclamation-circle"></i>';
    statusMessage.textContent = 'Error checking WhatsApp status';
    connectionProgress.className = 'progress-bar bg-danger';
    connectionProgress.style.width = '100%';
    
    // Show error details
    connectionDetails.innerHTML = `
      <div class="alert alert-danger p-2">
        <small>
          <i class="bi bi-exclamation-triangle me-1"></i>
          Error: ${error.message || 'Unknown error'}
        </small>
      </div>
    `;
    
    // Show connect and restart buttons on error
    if (connectBtn && restartBtn) {
      connectBtn.classList.remove('d-none');
      restartBtn.classList.remove('d-none');
    }
  }
}

/**
 * Update the WhatsApp status UI based on status data
 */
function updateWhatsAppStatusUI(data) {
  // Set basic button visibility - only if buttons exist
  const buttonsExist = connectBtn && disconnectBtn && restartBtn;
  
  // Update UI based on state
  if (data.state === 'connected') {
    // Connected state
    statusBadge.className = 'status-badge status-connected me-3';
    statusBadge.innerHTML = '<i class="bi bi-check-circle"></i>';
    statusMessage.textContent = 'WhatsApp is connected and ready';
    connectionProgress.className = 'progress-bar bg-success';
    
    // Show disconnect and restart buttons
    if (buttonsExist) {
      disconnectBtn.classList.remove('d-none');
      restartBtn.classList.remove('d-none');
    }
    
    // Format connection details
    let formattedDate = 'Unknown';
    let formattedTime = '';
    
    if (data.connectedSince) {
      const connectedDate = new Date(data.connectedSince);
      if (!isNaN(connectedDate)) {
        formattedDate = connectedDate.toLocaleDateString();
        formattedTime = connectedDate.toLocaleTimeString();
      }
    }
    
    const phoneNumber = data.phone || 'Unknown';
    const pushName = data.info?.me?.pushname || 'Unknown';

    connectionDetails.innerHTML = `
      <div class="mb-2">
        <small class="text-secondary">Connected Since:</small>
        <div class="fs-6">${formattedDate} ${formattedTime}</div>
      </div>
      <div class="mb-2">
        <small class="text-secondary">Phone Number:</small>
        <div class="fs-6">${phoneNumber}</div>
      </div>
      <div>
        <small class="text-secondary">Profile Name:</small>
        <div class="fs-6">${pushName}</div>
      </div>
    `;
  } 
  else if (data.state === 'qr_ready' && data.qrCode) {
    // QR code available - awaiting authentication
    statusBadge.className = 'status-badge status-connecting me-3';
    statusBadge.innerHTML = '<i class="bi bi-qr-code"></i>';
    statusMessage.textContent = 'Scan QR code with WhatsApp on your phone';
    connectionProgress.className = 'progress-bar bg-warning';
    
    // Display QR code
    qrCode.classList.remove('d-none');
    qrCode.innerHTML = data.qrCode;
    isQrDisplayed = true;
    
    // Clear connection details
    connectionDetails.innerHTML = `
      <div class="alert alert-info p-2">
        <small>
          <i class="bi bi-info-circle me-1"></i>
          Scan the QR code with your phone to authenticate WhatsApp Web
        </small>
      </div>
    `;
    
    // Show restart button
    if (buttonsExist) {
      restartBtn.classList.remove('d-none');
    }
  }
  else if (data.state === 'connecting' || data.state === 'initializing') {
    // Connecting or initializing state
    statusBadge.className = 'status-badge status-connecting me-3';
    statusBadge.innerHTML = '<i class="bi bi-hourglass-split"></i>';
    statusMessage.textContent = 'Connecting to WhatsApp...';
    connectionProgress.className = 'progress-bar bg-warning progress-bar-striped progress-bar-animated';
    connectionProgress.style.width = '50%';
    
    // Clear connection details
    connectionDetails.innerHTML = `
      <div class="alert alert-warning p-2">
        <small>
          <i class="bi bi-hourglass-split me-1"></i>
          Initializing WhatsApp connection, please wait...
        </small>
      </div>
    `;
    
    // Show restart button
    if (buttonsExist) {
      restartBtn.classList.remove('d-none');
    }
  }
  else if (data.state === 'error') {
    // Error state
    statusBadge.className = 'status-badge status-disconnected me-3';
    statusBadge.innerHTML = '<i class="bi bi-exclamation-triangle"></i>';
    statusMessage.textContent = 'WhatsApp connection error';
    connectionProgress.className = 'progress-bar bg-danger';
    
    // Show connect and restart buttons
    if (buttonsExist) {
      connectBtn.classList.remove('d-none');
      restartBtn.classList.remove('d-none');
    }
    
    // Show error details
    connectionDetails.innerHTML = `
      <div class="alert alert-danger p-2">
        <small>
          <i class="bi bi-exclamation-triangle me-1"></i>
          Connection error: ${data.error || 'Unknown error'}
        </small>
      </div>
      <div class="alert alert-secondary p-2 bg-dark border-secondary">
        <small>
          <i class="bi bi-info-circle me-1"></i>
          Click "Connect" to try generating a new QR code.
        </small>
      </div>
    `;
  }
  else {
    // Disconnected state (fallback for any other state)
    statusBadge.className = 'status-badge status-disconnected me-3';
    statusBadge.innerHTML = '<i class="bi bi-x-circle"></i>';
    statusMessage.textContent = 'WhatsApp is disconnected';
    connectionProgress.className = 'progress-bar bg-danger';
    
    // Show connect button
    if (buttonsExist) {
      connectBtn.classList.remove('d-none');
    }
    
    // Clear connection details
    connectionDetails.innerHTML = `
      <div class="alert alert-secondary p-2 bg-dark border-secondary">
        <i class="bi bi-info-circle me-1"></i>
        Not connected to WhatsApp. Click "Connect" to generate a QR code.
      </div>
    `;
  }
}

/**
 * Connect to WhatsApp by requesting a new QR code
 */
async function connectWhatsApp() {
  if (confirm('Do you want to connect to WhatsApp? This will generate a new QR code to scan.')) {
    try {
      // Stop status polling during connection
      stopStatusPolling();
      
      // Update UI to show connection in progress
      statusBadge.className = 'status-badge status-connecting me-3';
      statusBadge.innerHTML = '<i class="bi bi-arrow-clockwise"></i>';
      statusMessage.textContent = 'Initializing WhatsApp client...';
      connectionProgress.style.width = '50%';
      connectionProgress.className = 'progress-bar bg-warning progress-bar-striped progress-bar-animated';
      
      // Hide all buttons while connecting
      if (connectBtn && disconnectBtn && restartBtn) {
        connectBtn.classList.add('d-none');
        disconnectBtn.classList.add('d-none');
        restartBtn.classList.add('d-none');
      }
      
      // Clear any existing QR code
      qrCode.innerHTML = '';
      qrCode.classList.add('d-none');
      isQrDisplayed = false;
      
      // Use the connect endpoint for QR code generation
      const response = await fetch('/api/whatsapp/connect', {
        method: 'POST'
      });
      
      if (response.ok) {
        // Show a message during connection
        connectionDetails.innerHTML = `
          <div class="alert alert-warning p-2">
            <i class="bi bi-hourglass-split me-1"></i>
            Generating QR code, please wait...
          </div>
        `;
        
        // Restart polling immediately to look for QR code
        startStatusPolling();
      } else {
        const data = await response.json();
        alert(`Failed to connect WhatsApp: ${data.error || 'Unknown error'}`);
        checkWhatsAppStatus();
        startStatusPolling();
      }
    } catch (error) {
      console.error('Error connecting WhatsApp:', error);
      alert(`Error connecting WhatsApp: ${error.message || 'Unknown error'}`);
      checkWhatsAppStatus();
      startStatusPolling();
    }
  }
}

/**
 * Disconnect from WhatsApp
 */
async function disconnectWhatsApp() {
  if (confirm('Are you sure you want to disconnect from WhatsApp?')) {
    try {
      // Stop status polling during disconnection
      stopStatusPolling();
      
      // Update UI to show disconnection in progress
      statusBadge.className = 'status-badge status-connecting me-3';
      statusBadge.innerHTML = '<i class="bi bi-arrow-clockwise"></i>';
      statusMessage.textContent = 'Disconnecting from WhatsApp...';
      connectionProgress.style.width = '50%';
      connectionProgress.className = 'progress-bar bg-info progress-bar-striped progress-bar-animated';
      
      // Hide all buttons during disconnection
      if (connectBtn && disconnectBtn && restartBtn) {
        connectBtn.classList.add('d-none');
        disconnectBtn.classList.add('d-none');
        restartBtn.classList.add('d-none');
      }
      
      // Clear any existing QR code
      qrCode.innerHTML = '';
      qrCode.classList.add('d-none');
      isQrDisplayed = false;
      
      // Use the disconnect endpoint
      const response = await fetch('/api/whatsapp/disconnect', {
        method: 'POST'
      });
      
      if (response.ok) {
        // Show a message about disconnection
        connectionDetails.innerHTML = `
          <div class="alert alert-info p-2">
            <i class="bi bi-info-circle me-1"></i>
            Disconnected. Click "Connect" to generate a QR code and reconnect.
          </div>
        `;
        
        // Check the new status after disconnection
        checkWhatsAppStatus();
        startStatusPolling();
      } else {
        const data = await response.json();
        alert(`Failed to disconnect WhatsApp: ${data.error || 'Unknown error'}`);
        checkWhatsAppStatus();
        startStatusPolling();
      }
    } catch (error) {
      console.error('Error disconnecting WhatsApp:', error);
      alert(`Error disconnecting WhatsApp: ${error.message || 'Unknown error'}`);
      checkWhatsAppStatus();
      startStatusPolling();
    }
  }
}

/**
 * Restart the WhatsApp client
 */
async function restartWhatsAppClient() {
  if (confirm('Are you sure you want to restart the WhatsApp client?')) {
    try {
      // Stop status polling during restart
      stopStatusPolling();
      
      // Update UI to show restart in progress
      statusBadge.className = 'status-badge status-connecting me-3';
      statusBadge.innerHTML = '<i class="bi bi-arrow-clockwise"></i>';
      statusMessage.textContent = 'Restarting WhatsApp client...';
      connectionProgress.style.width = '50%';
      connectionProgress.className = 'progress-bar bg-warning progress-bar-striped progress-bar-animated';
      
      // Hide all buttons during restart
      if (connectBtn && disconnectBtn && restartBtn) {
        connectBtn.classList.add('d-none');
        disconnectBtn.classList.add('d-none');
        restartBtn.classList.add('d-none');
      }
      
      // Clear any existing QR code
      qrCode.innerHTML = '';
      qrCode.classList.add('d-none');
      isQrDisplayed = false;
      
      const response = await fetch('/api/whatsapp/restart', {
        method: 'POST'
      });
      
      if (response.ok) {
        // Show a message during restart
        connectionDetails.innerHTML = `
          <div class="alert alert-warning p-2">
            <i class="bi bi-arrow-repeat me-1"></i>
            Restarting WhatsApp client, please wait...
          </div>
        `;
        
        // Restart status polling
        startStatusPolling();
      } else {
        const data = await response.json();
        alert(`Failed to restart WhatsApp client: ${data.error || 'Unknown error'}`);
        checkWhatsAppStatus();
        startStatusPolling();
      }
    } catch (error) {
      console.error('Error restarting WhatsApp client:', error);
      alert(`Error restarting WhatsApp client: ${error.message || 'Unknown error'}`);
      checkWhatsAppStatus();
      startStatusPolling();
    }
  }
}

/**
 * Fetch dashboard data from API
 */
async function fetchDashboardData() {
  try {
    const response = await fetch('/api/dashboard');
    const data = await response.json();
    
    // Update dashboard statistics
    if (document.getElementById('activeGroups')) {
      document.getElementById('activeGroups').textContent = data.activeGroups || 0;
    }
    
    if (document.getElementById('todayMessages')) {
      document.getElementById('todayMessages').textContent = data.todayMessages || 0;
    }
    
    if (document.getElementById('emailsSent')) {
      document.getElementById('emailsSent').textContent = data.emailsSent || 0;
    }
    
    if (document.getElementById('systemStatus')) {
      document.getElementById('systemStatus').innerHTML = data.systemHealthy 
        ? '<span class="badge bg-success">Healthy</span>' 
        : '<span class="badge bg-danger">Issue Detected</span>';
    }
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
  }
}

/**
 * Fetch recent logs
 */
async function fetchRecentLogs() {
  try {
    const response = await fetch('/api/logs/recent?limit=5');
    const logs = await response.json();
    
    const logsBody = document.getElementById('recentLogsBody');
    if (!logsBody) return;
    
    logsBody.innerHTML = '';
    
    if (logs.length === 0) {
      logsBody.innerHTML = `
        <tr>
          <td colspan="3" class="text-center py-4">No logs found</td>
        </tr>
      `;
      return;
    }
    
    logs.forEach(log => {
      const time = new Date(log.timestamp).toLocaleTimeString();
      const level = log.level.toUpperCase();
      const message = log.message;
      
      let levelClass = 'bg-secondary';
      if (level === 'ERROR') levelClass = 'bg-danger';
      if (level === 'WARN') levelClass = 'bg-warning';
      if (level === 'INFO') levelClass = 'bg-info';
      
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${time}</td>
        <td><span class="badge ${levelClass}">${level}</span></td>
        <td class="text-truncate">${message}</td>
      `;
      
      logsBody.appendChild(row);
    });
  } catch (error) {
    console.error('Error fetching recent logs:', error);
  }
}

// Live logs functionality
let liveLogsEnabled = false;
let liveLogsInterval = null;

/**
 * Toggle live logs
 */
function toggleLiveLogs() {
  const button = document.getElementById('liveLogToggle');
  const liveBadge = document.getElementById('liveBadge');
  
  if (!liveLogsEnabled) {
    // Enable live logs
    liveLogsEnabled = true;
    if (button) {
      button.innerHTML = '<i class="bi bi-pause-fill"></i> Pause';
    }
    if (liveBadge) {
      liveBadge.classList.remove('d-none');
    }
    
    // Start fetching logs periodically
    fetchRecentLogs();
    liveLogsInterval = setInterval(fetchRecentLogs, 5000);
  } else {
    // Disable live logs
    liveLogsEnabled = false;
    if (button) {
      button.innerHTML = '<i class="bi bi-play-fill"></i> Live';
    }
    if (liveBadge) {
      liveBadge.classList.add('d-none');
    }
    
    // Stop fetching logs
    if (liveLogsInterval) {
      clearInterval(liveLogsInterval);
      liveLogsInterval = null;
    }
  }
}

/**
 * Clear application cache
 */
async function clearCache() {
  if (confirm('Are you sure you want to clear the application cache?')) {
    try {
      const response = await fetch('/api/cache/clear', {
        method: 'POST'
      });
      
      if (response.ok) {
        alert('Cache cleared successfully');
      } else {
        const data = await response.json();
        alert(`Failed to clear cache: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error clearing cache:', error);
      alert(`Error clearing cache: ${error.message || 'Unknown error'}`);
    }
  }
} 