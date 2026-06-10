chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'extract-palette',
    title: 'Extract Color Palette from Image',
    contexts: ['image']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'extract-palette') {
    const imageUrl = info.srcUrl;

    fetch(imageUrl)
      .then(res => res.blob())
      .then(blob => new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      }))
      .then(dataUrl => {
        chrome.storage.local.set({ pendingImage: dataUrl }, () => {
          chrome.action.openPopup();
        });
      })
      .catch(() => {
        chrome.storage.local.set({ pendingImage: imageUrl }, () => {
          chrome.action.openPopup();
        });
      });
  }
});