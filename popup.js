document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btn');
  const message = document.getElementById('message');

  btn.addEventListener('click', () => {
    message.textContent = 'Hello from the extension!';
  });
});
