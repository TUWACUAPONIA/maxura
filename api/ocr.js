// /api/ocr.js
import multer from 'multer';
import fs from 'fs';
import { Storage } from '@google-cloud/storage';
import vision from '@google-cloud/vision';
import path from 'path';

export const config = {
  api: {
    bodyParser: false,
  },
};

const bucketName = 'orc-employsmart';

// Inicializar Google Storage y Vision con las credenciales del env
function getGCloudClients() {
  try {
    const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
    const storage = new Storage({ credentials });
    const visionClient = new vision.v1.ImageAnnotatorClient({ credentials });
    return { storage, visionClient };
  } catch (e) {
    console.error("Fallo al cargar credenciales de Google Cloud:", e);
    throw new Error("Credenciales de Google Cloud inválidas o faltantes");
  }
}

const tempDir = process.env.VERCEL_TMP_DIR || '/tmp';
const upload = multer({ dest: tempDir });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  upload.single('file')(req, res, async (err) => {
    console.log("OCR API: Request received", req);
    if (err instanceof multer.MulterError) {
      console.error("Multer error:", err);
      return res.status(500).json({ error: 'Error en upload (multer)' });
    } else if (err) {
      console.error("Unknown error:", err);
      return res.status(500).json({ error: 'Error desconocido en upload' });
    }

    console.log("OCR API: Archivo recibido:", req.file);

    if (!req.file) {
      console.error("No se recibió ningún archivo.");
      return res.status(400).json({ error: 'Archivo no enviado' });
    }

    const file = req.file;
    const filePath = file.path;
    console.log("OCR API: Ruta temporal del archivo:", filePath);

    if (!filePath) {
      console.error("El archivo recibido no tiene ruta temporal:", file);
      return res.status(400).json({ error: 'Archivo subido no tiene ruta temporal' });
    }

    const filename = path.basename(file.originalname || file.filename || 'archivo.pdf');

    let storage, visionClient;
    try {
      ({ storage, visionClient } = getGCloudClients());
      console.log("OCR API: Google Cloud clients initialized.");
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }

    try {
      // Subir el archivo PDF a GCS
      console.log("OCR API: Uploading file to GCS bucket:", bucketName, " - Filename:", filename);
      await storage.bucket(bucketName).upload(filePath, {
        destination: filename,
        resumable: false,
        metadata: { contentType: file.mimetype }
      });
      console.log("OCR API: File uploaded to GCS successfully. Filename:", filename);

      const gcsUri = `gs://${bucketName}/${filename}`;
      console.log("OCR API: GCS URI:", gcsUri);
      // Pedir OCR a Google Vision (DOCUMENT_TEXT_DETECTION)
      console.log("OCR API: Calling Google Vision API for OCR.");
      const [operation] = await visionClient.asyncBatchAnnotateFiles({
        requests: [
          {
            inputConfig: {
              gcsSource: { uri: gcsUri },
              mimeType: 'application/pdf',
            },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
            outputConfig: {
              gcsDestination: { uri: `gs://${bucketName}/ocr_results/` }
            }
          }
        ]
      });
      console.log("OCR API: Google Vision API call initiated. Operation name:", operation.name);

      // Esperar a que termine el procesamiento
      console.log("OCR API: Waiting for OCR processing to complete.");
      await operation.promise();
      console.log("OCR API: OCR processing completed successfully.");

      // Descargar el resultado de OCR desde el bucket
      console.log("OCR API: Downloading OCR results from GCS bucket:", bucketName);
      // Buscamos el archivo .json generado en /ocr_results/
      const [resultFiles] = await storage.bucket(bucketName).getFiles({ prefix: 'ocr_results/' });
      console.log("OCR API: Files found in GCS bucket:", resultFiles.map(f => f.name));
      let resultText = '';

      for (const resultFile of resultFiles) {
        if (resultFile.name.endsWith('.json')) {
          console.log("OCR API: Processing result file:", resultFile.name);
          try {
            const data = await resultFile.download();
            console.log("OCR API: Result file downloaded successfully.");
            const json = JSON.parse(data.toString());
            console.log("OCR API: Result file parsed as JSON successfully.");
            // El texto extraído está en fullTextAnnotation.text
            if (
              json.responses &&
              json.responses[0] &&
              json.responses[0].fullTextAnnotation &&
              json.responses[0].fullTextAnnotation.text
            ) {
              resultText += json.responses[0].fullTextAnnotation.text + '\n';
            }
          } catch (downloadError) {
            console.error("OCR API: Error downloading or parsing result file:", resultFile.name, downloadError);
          }
        }
      }
      console.log("OCR API: OCR results downloaded and processed. Result text (first 300 chars):", resultText.substring(0, 300));

      // Limpiar: eliminar archivo PDF y JSON de OCR del bucket
      console.log("OCR API: Cleaning up GCS bucket. Deleting PDF and JSON files.");
      // await storage.bucket(bucketName).file(filename).delete();
      // for (const resultFile of resultFiles) {
      //   await resultFile.delete();
      // }
      console.log("OCR API: GCS bucket cleanup completed.");

      res.status(200).json({ text: resultText });
    } catch (e) {
      console.error("OCR API: General error during OCR processing:", e);
      res.status(500).json({ error: e.message });
    } finally {
      // Limpiar archivo local temporal
      console.log("OCR API: Cleaning up local temporary file.");
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      console.log("OCR API: Local temporary file cleanup completed.");
    }
  });
}
