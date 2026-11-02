const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('setup', {save: id => ipcRenderer.invoke('save-id', id)});
