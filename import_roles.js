const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const { GoogleGenAI } = require('@google/genai');
require('dotenv').config();
const { sql, poolPromise } = require('./config/db');

// Verifica que la API Key esté configurada
if (!process.env.GEMINI_API_KEY) {
    console.error("❌ ERROR: Debes configurar GEMINI_API_KEY en el archivo .env");
    process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const REVISADOS_DIR = path.join(__dirname, '..', 'REVISADOS');

async function extractInfoFromText(text, fileName) {
    const prompt = `
A continuación tienes el texto de un documento de perfil de cargo ("${fileName}").
Extrae la información y devuélvela en formato JSON estrictamente válido, sin usar bloques de código Markdown (no escribas \`\`\`json).
La estructura debe ser la siguiente:
{
  "area": "Nombre del área o departamento al que pertenece (si no se especifica, usa 'General')",
  "cargo": "Nombre del cargo",
  "mision": "Misión o propósito del cargo",
  "funciones": ["Función 1", "Función 2", "Función 3"],
  "requisitos": {
     "educacion": ["Educación requerida"],
     "experiencia": ["Experiencia requerida"],
     "habilidades": ["Habilidad 1", "Habilidad 2"]
  }
}

Texto del documento:
${text}
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                temperature: 0.2,
                responseMimeType: "application/json"
            }
        });

        let jsonText = response.text();
        return JSON.parse(jsonText);
    } catch (error) {
        console.error(`❌ Error procesando con Gemini el archivo ${fileName}:`, error.message);
        return null;
    }
}

async function main() {
    try {
        const pool = await poolPromise;
        console.log("✅ Conectado a la base de datos.");

        if (!fs.existsSync(REVISADOS_DIR)) {
            console.error(`❌ El directorio ${REVISADOS_DIR} no existe.`);
            process.exit(1);
        }

        const files = fs.readdirSync(REVISADOS_DIR).filter(file => file.endsWith('.docx'));
        console.log(`📂 Encontrados ${files.length} archivos .docx en REVISADOS.`);

        for (const file of files) {
            console.log(`\n📄 Procesando: ${file}`);
            const filePath = path.join(REVISADOS_DIR, file);

            // 1. Extraer texto del DOCX
            let text = "";
            try {
                const result = await mammoth.extractRawText({ path: filePath });
                text = result.value;
            } catch (err) {
                console.error(`❌ Error extrayendo texto de ${file}:`, err.message);
                continue;
            }

            if (!text || text.trim() === '') {
                console.log(`⚠️ Archivo vacío o ilegible: ${file}`);
                continue;
            }

            // 2. Usar Gemini para estructurar el JSON
            console.log(`🧠 Estructurando con IA...`);
            const structuredData = await extractInfoFromText(text, file);

            if (!structuredData) {
                continue;
            }

            // Fallbacks si la IA no encuentra algo
            const area = structuredData.area || 'General';
            // Intentar sacar el cargo del nombre del archivo si la IA falla
            let cargoName = structuredData.cargo;
            if (!cargoName) {
                const match = file.match(/ROL (.*)\.docx/i);
                cargoName = match ? match[1].trim() : file.replace('.docx', '');
            }

            // 3. Insertar en la base de datos usando el store procedure spPerfilesCargo
            console.log(`💾 Insertando en la BD: Cargo [${cargoName}] - Área [${area}]...`);
            try {
                await pool.request()
                    .input('ACCION', sql.VarChar(50), 'INSERT')
                    .input('DATA_JSON', sql.VarChar, JSON.stringify({
                        empresa_id: '00', // Asumiendo empresa_id por defecto '00'
                        area: area,
                        cargo: cargoName,
                        perfil_json: structuredData // Pasamos el objeto, se hace string internamente si es necesario
                    }))
                    .execute('spPerfilesCargo');
                
                console.log(`✅ [ÉXITO] ${file} insertado correctamente.`);
            } catch (dbErr) {
                console.error(`❌ Error insertando en BD para ${file}:`, dbErr.originalError ? dbErr.originalError.info.message : dbErr.message);
            }
        }

        console.log("\n🎉 Proceso completado.");
        process.exit(0);

    } catch (err) {
        console.error("❌ Error general:", err);
        process.exit(1);
    }
}

main();
