document.getElementById('save').onclick = async () => {
  try { await window.setup.save(document.getElementById('client').value.trim()); }
  catch { document.getElementById('error').textContent = 'Вставь Application ID: от 17 до 22 цифр.'; }
};
