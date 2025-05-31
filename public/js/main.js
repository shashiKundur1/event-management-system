// Handle User Menu
document.addEventListener('DOMContentLoaded', function() {
  // Dropdown menus
  const userMenuBtn = document.querySelector('.user-menu-btn');
  const userDropdown = document.querySelector('.user-dropdown');
  
  if (userMenuBtn && userDropdown) {
    userMenuBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      userDropdown.style.display = userDropdown.style.display === 'block' ? 'none' : 'block';
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', function() {
      userDropdown.style.display = 'none';
    });
    
    // Prevent dropdown from closing when clicking inside
    userDropdown.addEventListener('click', function(e) {
      e.stopPropagation();
    });
  }
  
  // Mobile navigation toggle
  const mobileNavToggle = document.querySelector('.mobile-nav-toggle');
  const mainNav = document.querySelector('.main-nav');
  
  if (mobileNavToggle && mainNav) {
    mobileNavToggle.addEventListener('click', function() {
      mainNav.classList.toggle('active');
    });
  }
  
  // Smooth scroll for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      if (this.getAttribute('href') !== '#') {
        e.preventDefault();
        
        const targetId = this.getAttribute('href');
        const targetElement = document.querySelector(targetId);
        
        if (targetElement) {
          window.scrollTo({
            top: targetElement.offsetTop - 80,
            behavior: 'smooth'
          });
        }
      }
    });
  });
  
  // Show/hide message
  window.showMessage = function(type, message) {
    const messageContainer = document.getElementById('message-container');
    if (!messageContainer) {
      const container = document.createElement('div');
      container.id = 'message-container';
      document.body.prepend(container);
    }
    
    const messageElement = document.createElement('div');
    messageElement.className = `message ${type}`;
    messageElement.innerHTML = `
      <div class="message-content">
        <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i>
        <p>${message}</p>
      </div>
      <button class="close-message" aria-label="Close message">
        <i class="fas fa-times"></i>
      </button>
    `;
    
    document.getElementById('message-container').appendChild(messageElement);
    
    // Add event listener to close button
    messageElement.querySelector('.close-message').addEventListener('click', function() {
      messageElement.remove();
    });
    
    // Auto remove after 5 seconds
    setTimeout(() => {
      if (messageElement.parentNode) {
        messageElement.remove();
      }
    }, 5000);
  };
  
  // Close all messages
  document.querySelectorAll('.close-message').forEach(button => {
    button.addEventListener('click', function() {
      this.closest('.message').remove();
    });
  });
});