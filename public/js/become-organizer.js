document.addEventListener('DOMContentLoaded', function() {
  const becomeOrganizerBtn = document.getElementById('become-organizer');
  
  if (becomeOrganizerBtn) {
    becomeOrganizerBtn.addEventListener('click', async function(e) {
      e.preventDefault();
      
      if (confirm('Are you sure you want to become an organizer?')) {
        try {
          const response = await fetch('/user/become-organizer', {
            method: 'POST'
          });
          
          const data = await response.json();
          
          if (response.ok) {
            showMessage('success', data.message);
            setTimeout(() => {
              window.location.reload();
            }, 1500);
          } else {
            showMessage('error', data.message);
          }
        } catch (error) {
          showMessage('error', 'An error occurred. Please try again.');
        }
      }
    });
  }
});