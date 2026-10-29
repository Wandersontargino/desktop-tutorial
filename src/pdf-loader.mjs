import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
pdfjs.GlobalWorkerOptions.workerSrc='/vendor/pdf/pdf.worker.min.mjs';
window.PlatformPDF={getDocument:pdfjs.getDocument};
