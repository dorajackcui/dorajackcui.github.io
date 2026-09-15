document.querySelector('.control-examples').addEventListener('submit', event => event.preventDefault());

const copyButton = document.querySelector('#copy-prompt');
const promptField = document.querySelector('#handoff-prompt');
const copyStatus = document.querySelector('#copy-status');

copyButton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(promptField.value);
    copyStatus.textContent = '已复制';
  } catch {
    promptField.focus();
    promptField.select();
    copyStatus.textContent = '已选中，请复制';
  }
});
