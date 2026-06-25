const docx = require('docx');
const { 
  Document, 
  Packer, 
  Paragraph, 
  Table, 
  TableRow, 
  TableCell, 
  TextRun, 
  WidthType, 
  BorderStyle, 
  AlignmentType, 
  HeadingLevel 
} = docx;

// Helper to create common section titles
function createSectionTitle(text) {
  return new Paragraph({
    spacing: { before: 240, after: 120 },
    keepWithNext: true,
    children: [
      new TextRun({
        text: text.toUpperCase(),
        bold: true,
        size: 22, // 11pt
        font: "Arial"
      })
    ]
  });
}

// Helper to create list items
function createBulletItem(text) {
  return new Paragraph({
    bullet: {
      level: 0
    },
    spacing: { before: 80, after: 80 },
    children: [
      new TextRun({
        text: text,
        size: 20, // 10pt
        font: "Arial"
      })
    ]
  });
}

function generateDocx(profile) {
  const pj = profile.perfil_json;

  // Title
  const docTitle = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 120, after: 240 },
    children: [
      new TextRun({
        text: `ROL ${profile.cargo.toUpperCase()}`,
        bold: true,
        size: 28, // 14pt
        font: "Arial"
      })
    ]
  });

  // Table styling
  const cellBorder = {
    style: BorderStyle.SINGLE,
    size: 4,
    color: "94A3B8"
  };

  const tableBorders = {
    top: cellBorder,
    bottom: cellBorder,
    left: cellBorder,
    right: cellBorder,
    insideHorizontal: cellBorder,
    insideVertical: cellBorder
  };

  // Identification Table
  const identTableHeader = new TableRow({
    children: [
      new TableCell({
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: "IDENTIFICACIÓN DEL CARGO",
                bold: true,
                size: 20,
                font: "Arial",
                color: "1E293B"
              })
            ]
          })
        ],
        columnSpan: 2,
        shading: { fill: "F1F5F9" },
        margins: { top: 120, bottom: 120, left: 120, right: 120 }
      })
    ]
  });

  const createIdentRow = (label, val) => {
    return new TableRow({
      children: [
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: label,
                  bold: true,
                  size: 20,
                  font: "Arial"
                })
              ]
            })
          ],
          width: { size: 30, type: WidthType.PERCENTAGE },
          shading: { fill: "F8FAFC" },
          margins: { top: 100, bottom: 100, left: 120, right: 120 }
        }),
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: val || "No aplica/No especifica",
                  size: 20,
                  font: "Arial"
                })
              ]
            })
          ],
          width: { size: 70, type: WidthType.PERCENTAGE },
          margins: { top: 100, bottom: 100, left: 120, right: 120 }
        })
      ]
    });
  };

  const identificationTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders,
    rows: [
      identTableHeader,
      createIdentRow("Nombre del cargo", profile.cargo),
      createIdentRow("Contractual", pj.contractual),
      createIdentRow("Área", profile.area),
      createIdentRow("Reporta a", pj.reporta_a),
      createIdentRow("Supervisa", pj.supervisa)
    ]
  });

  const docChildren = [
    docTitle,
    createSectionTitle("IDENTIFICACIÓN DEL CARGO"),
    identificationTable
  ];

  // Proposito del cargo
  if (pj.proposito) {
    docChildren.push(createSectionTitle("PROPOSITO DEL CARGO"));
    docChildren.push(
      new Paragraph({
        spacing: { before: 80, after: 120 },
        children: [
          new TextRun({
            text: pj.proposito,
            size: 20,
            font: "Arial"
          })
        ]
      })
    );
  }

  // Funciones y Responsabilidades
  if (pj.funciones && pj.funciones.length > 0) {
    docChildren.push(createSectionTitle("DESCRIPCIÓN DE FUNCIONES Y RESPONSABILIDADES"));
    pj.funciones.forEach(func => {
      docChildren.push(createBulletItem(func));
    });
  }

  // Autoridad
  if (pj.autoridad) {
    docChildren.push(createSectionTitle("AUTORIDAD"));
    docChildren.push(
      new Paragraph({
        spacing: { before: 80, after: 120 },
        children: [
          new TextRun({
            text: pj.autoridad,
            size: 20,
            font: "Arial"
          })
        ]
      })
    );
  }

  // Requisitos
  if (pj.requisitos) {
    const req = pj.requisitos;
    if (req.formacion || req.experiencia || (req.conocimientos_basicos && req.conocimientos_basicos.length > 0) || (req.competencias && req.competencias.length > 0)) {
      docChildren.push(createSectionTitle("CONOCIMIENTOS, COMPETENCIAS Y/O APTITUDES"));

      if (req.formacion) {
        docChildren.push(
          new Paragraph({
            spacing: { before: 80, after: 40 },
            children: [
              new TextRun({ text: "Formación académica", bold: true, size: 20, font: "Arial" })
            ]
          })
        );
        docChildren.push(
          new Paragraph({
            spacing: { before: 0, after: 120 },
            children: [
              new TextRun({ text: req.formacion, size: 20, font: "Arial" })
            ]
          })
        );
      }

      if (req.experiencia) {
        docChildren.push(
          new Paragraph({
            spacing: { before: 80, after: 40 },
            children: [
              new TextRun({ text: "Experiencia", bold: true, size: 20, font: "Arial" })
            ]
          })
        );
        docChildren.push(
          new Paragraph({
            spacing: { before: 0, after: 120 },
            children: [
              new TextRun({ text: req.experiencia, size: 20, font: "Arial" })
            ]
          })
        );
      }

      if (req.conocimientos_basicos && req.conocimientos_basicos.length > 0) {
        docChildren.push(
          new Paragraph({
            spacing: { before: 80, after: 80 },
            children: [
              new TextRun({ text: "Conocimientos básicos", bold: true, size: 20, font: "Arial" })
            ]
          })
        );
        req.conocimientos_basicos.forEach(c => {
          docChildren.push(createBulletItem(c));
        });
      }

      if (req.competencias && req.competencias.length > 0) {
        docChildren.push(
          new Paragraph({
            spacing: { before: 80, after: 80 },
            children: [
              new TextRun({ text: "Competencias / Habilidades", bold: true, size: 20, font: "Arial" })
            ]
          })
        );
        req.competencias.forEach(c => {
          docChildren.push(createBulletItem(c));
        });
      }
    }
  }

  // Indicadores
  if (pj.indicadores && pj.indicadores.length > 0) {
    docChildren.push(createSectionTitle("INDICADORES DE MEDICION"));

    const indicatorHeader = new TableRow({
      children: [
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: "NOMBRE DEL INDICADOR", bold: true, size: 18, font: "Arial" })] })],
          width: { size: 40, type: WidthType.PERCENTAGE },
          shading: { fill: "F1F5F9" },
          margins: { top: 100, bottom: 100, left: 100, right: 100 }
        }),
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: "NIVEL / META", bold: true, size: 18, font: "Arial" })] })],
          width: { size: 20, type: WidthType.PERCENTAGE },
          shading: { fill: "F1F5F9" },
          margins: { top: 100, bottom: 100, left: 100, right: 100 }
        }),
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: "FÓRMULA / CRITERIO", bold: true, size: 18, font: "Arial" })] })],
          width: { size: 40, type: WidthType.PERCENTAGE },
          shading: { fill: "F1F5F9" },
          margins: { top: 100, bottom: 100, left: 100, right: 100 }
        })
      ]
    });

    const indicatorRows = pj.indicadores.map(ind => {
      return new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: ind.nombre || "", size: 18, font: "Arial" })] })],
            margins: { top: 80, bottom: 80, left: 100, right: 100 }
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: ind.nivel || "", size: 18, font: "Arial" })] })],
            margins: { top: 80, bottom: 80, left: 100, right: 100 }
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: ind.formula || "", size: 18, font: "Arial" })] })],
            margins: { top: 80, bottom: 80, left: 100, right: 100 }
          })
        ]
      });
    });

    const indicatorsTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: tableBorders,
      rows: [indicatorHeader, ...indicatorRows]
    });

    docChildren.push(indicatorsTable);
  }

  // Create Document structure
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: docChildren
      }
    ]
  });

  return doc;
}

module.exports = {
  generateDocx
};
