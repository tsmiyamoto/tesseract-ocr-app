const fileInput = document.getElementById('file-input');
const clearButton = document.getElementById('clear-button');
const progressElement = document.getElementById('progress');
const resultsElement = document.getElementById('results');

const progressContext = {
  handler: null,
  workerPromise: null,
};

const pdfjsLib = window['pdfjs-dist/build/pdf'];
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.js';

fileInput.addEventListener('change', handleFileSelection);
clearButton.addEventListener('click', resetApp);

function resetApp() {
  fileInput.value = '';
  resultsElement.innerHTML = '';
  updateProgressMessage('ファイルを選択してください。');
}

async function handleFileSelection(event) {
  const [file] = event.target.files;
  resultsElement.innerHTML = '';

  if (!file) {
    updateProgressMessage('ファイルが選択されていません。');
    return;
  }

  try {
    if (isPdf(file)) {
      await processPdf(file);
    } else if (isImage(file)) {
      await processImage(createObjectUrl(file), file.name);
    } else {
      updateProgressMessage('画像ファイルまたはPDFを選択してください。');
    }
  } catch (error) {
    console.error(error);
    updateProgressMessage('処理中にエラーが発生しました。コンソールを確認してください。');
  }
}

function isPdf(file) {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

function isImage(file) {
  return file.type.startsWith('image/');
}

function createObjectUrl(file) {
  const url = URL.createObjectURL(file);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return url;
}

async function processPdf(file) {
  updateProgressMessage('PDFを読み込み中...');
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: context, viewport }).promise;
    const imageData = canvas.toDataURL('image/png');

    await processImage(imageData, `${pageNumber}ページ`);
  }

  updateProgressMessage('PDFの処理が完了しました。');
}

async function processImage(imageSource, label = '') {
  const worker = await ensureWorker();

  progressContext.handler = (message) => handleProgress(message, label);
  const { data } = await worker.recognize(imageSource);
  progressContext.handler = null;

  appendResult(label || '画像', data.text);
  updateProgressMessage(`${label || '画像'}のOCRが完了しました。`);
}

async function ensureWorker() {
  if (!progressContext.workerPromise) {
    progressContext.workerPromise = (async () => {
      updateProgressMessage('Tesseract.js を初期化しています...');
      const worker = await Tesseract.createWorker({
        logger: (message) => {
          if (progressContext.handler) {
            progressContext.handler(message);
          }
        },
      });
      await worker.loadLanguage('jpn');
      await worker.initialize('jpn');
      return worker;
    })();
  }

  return progressContext.workerPromise;
}

function handleProgress(message, label) {
  const prefix = label ? `${label}: ` : '';
  if (message.status) {
    const percent = message.progress
      ? ` (${Math.round(message.progress * 100)}%)`
      : '';
    updateProgressMessage(`${prefix}${translateStatus(message.status)}${percent}`);
  }
}

function translateStatus(status) {
  switch (status) {
    case 'loading language traineddata':
      return '言語データを読み込んでいます';
    case 'initializing api':
      return 'OCRエンジンを初期化しています';
    case 'recognizing text':
      return '文字を解析しています';
    default:
      return status;
  }
}

function updateProgressMessage(text) {
  progressElement.textContent = text;
}

function appendResult(title, text) {
  const container = document.createElement('article');
  container.className = 'result-item';

  const heading = document.createElement('h3');
  heading.textContent = title;

  const pre = document.createElement('pre');
  pre.textContent = text.trim() || '[抽出されたテキストはありません]';

  container.appendChild(heading);
  container.appendChild(pre);
  resultsElement.appendChild(container);
}
