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
  HeadingLevel,
  ImageRun
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

// Generates the FTO-GH-001 "Hoja de Vida Corporativa" layout from a candidate's
// perfil_completo_json, mirroring ARTDECON's official PDF/Excel template.
function generateHojaVidaCorporativaDocx(perfil, cargo, fechaPostulacion, logoBuffer) {
  const p = perfil || {};

  const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: "94A3B8" };
  const tableBorders = {
    top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder,
    insideHorizontal: cellBorder, insideVertical: cellBorder
  };
  const noBorders = {
    top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
    left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
    insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE }
  };

  const labelValueCell = (label, value, widthPercent) => new TableCell({
    width: { size: widthPercent, type: WidthType.PERCENTAGE },
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    children: [
      new Paragraph({
        children: [
          new TextRun({ text: `${label}: `, bold: true, size: 18, font: "Arial" }),
          new TextRun({ text: value || "", size: 18, font: "Arial" })
        ]
      })
    ]
  });

  const sectionBarRow = (text, colSpan) => new TableRow({
    children: [
      new TableCell({
        columnSpan: colSpan,
        shading: { fill: "DCE6F1" },
        margins: { top: 80, bottom: 80, left: 100, right: 100 },
        children: [new Paragraph({ children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 20, font: "Arial" })] })]
      })
    ]
  });

  const headerCell = (text, widthPercent) => new TableCell({
    width: { size: widthPercent, type: WidthType.PERCENTAGE },
    shading: { fill: "F1F5F9" },
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, bold: true, size: 18, font: "Arial" })] })]
  });

  const plainCell = (text, widthPercent) => new TableCell({
    width: { size: widthPercent, type: WidthType.PERCENTAGE },
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    children: [new Paragraph({ children: [new TextRun({ text: text || "", size: 18, font: "Arial" })] })]
  });

  const emptyRow = (colSpan, message) => new TableRow({
    children: [
      new TableCell({
        columnSpan: colSpan,
        margins: { top: 80, bottom: 80, left: 100, right: 100 },
        children: [new Paragraph({ children: [new TextRun({ text: message || "No registra", italics: true, size: 18, font: "Arial" })] })]
      })
    ]
  });

  const buildListTable = (headers, widths, rows) => {
    const headerRow = new TableRow({ children: headers.map((h, i) => headerCell(h, widths[i])) });
    const dataRows = (rows && rows.length > 0)
      ? rows.map(r => new TableRow({ children: r.map((val, i) => plainCell(val, widths[i])) }))
      : [emptyRow(headers.length)];
    return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: tableBorders, rows: [headerRow, ...dataRows] });
  };

  // ---- Letterhead: logo | title | codes box ----
  const codesTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders,
    rows: [
      new TableRow({ children: [plainCell("Código:", 45), plainCell("FTO-GH-001", 55)] }),
      new TableRow({ children: [plainCell("Fecha de vigencia:", 45), plainCell("22-03-2023", 55)] }),
      new TableRow({ children: [plainCell("Versión:", 45), plainCell("1", 55)] }),
      new TableRow({ children: [plainCell("Página:", 45), plainCell("1 de 1", 55)] })
    ]
  });

  const logoCellChildren = [];
  if (logoBuffer) {
    logoCellChildren.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new ImageRun({ data: logoBuffer, type: "png", transformation: { width: 150, height: 34 } })]
    }));
  } else {
    logoCellChildren.push(new Paragraph({ children: [new TextRun({ text: "ARTDECON", bold: true, size: 28, font: "Arial" })] }));
  }

  const letterheadTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: noBorders,
    rows: [
      new TableRow({
        children: [
          new TableCell({ width: { size: 30, type: WidthType.PERCENTAGE }, verticalAlign: "center", children: logoCellChildren }),
          new TableCell({
            width: { size: 40, type: WidthType.PERCENTAGE },
            verticalAlign: "center",
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "HOJA DE VIDA CORPORATIVA", bold: true, size: 24, font: "Arial" })] })]
          }),
          new TableCell({ width: { size: 30, type: WidthType.PERCENTAGE }, children: [codesTable] })
        ]
      })
    ]
  });

  // ---- Cargo / Fecha ----
  const cargoFechaTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders,
    rows: [new TableRow({ children: [labelValueCell("Cargo al que aspira", cargo, 65), labelValueCell("Fecha", fechaPostulacion, 35)] })]
  });

  // ---- Datos Personales ----
  const datosPersonalesTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders,
    rows: [
      sectionBarRow("Datos Personales", 4),
      new TableRow({ children: [labelValueCell("Nombres y apellidos", p.nombre_completo, 100)] }),
      new TableRow({
        children: [
          labelValueCell("No de cédula", p.cedula, 30),
          labelValueCell("Edad", p.edad, 20),
          labelValueCell("EPS", p.eps, 25),
          labelValueCell("F. de pensión", p.fondo_pension, 25)
        ]
      }),
      new TableRow({
        children: [
          labelValueCell("Dirección", p.direccion, 40),
          labelValueCell("Barrio", p.barrio, 30),
          labelValueCell("Ciudad", p.ciudad, 30)
        ]
      }),
      new TableRow({
        children: [
          labelValueCell("Teléfono", p.telefono, 30),
          labelValueCell("Correo electrónico", p.correo, 40),
          labelValueCell("Fecha de nacimiento", p.fecha_nacimiento, 30)
        ]
      }),
      new TableRow({
        children: [
          labelValueCell("Estado civil", p.estado_civil, 30),
          labelValueCell("Talla de camisa", p.talla_camisa, 23),
          labelValueCell("Talla de pantalón", p.talla_pantalon, 23),
          labelValueCell("Talla de zapato", p.talla_zapato, 24)
        ]
      })
    ]
  });

  // ---- Personas a Cargo ----
  const personasACargo = p.personas_a_cargo || [];
  const personasTable = buildListTable(
    ["Parentesco", "Nombres", "Número de Identificación", "Edad"],
    [25, 35, 25, 15],
    personasACargo.map(pc => [pc.parentesco, pc.nombres, pc.numero_identificacion, String(pc.edad || "")])
  );

  // ---- Estudios ----
  const estudios = p.estudios || [];
  const estudiosTable = buildListTable(
    ["Nivel", "Institución", "Título Obtenido", "Fecha"],
    [20, 30, 30, 20],
    estudios.map(e => [e.nivel, e.institucion, e.titulo, (e.mesFin && e.anioFin) ? `${e.mesFin} de ${e.anioFin}` : (e.fecha_fin || "")])
  );

  // ---- Experiencia Laboral ----
  const experiencias = p.experiencias || [];
  const experienciaTable = buildListTable(
    ["Empresa", "Funciones Desempeñadas", "Fecha de Ingreso", "Fecha de Retiro"],
    [22, 38, 20, 20],
    experiencias.map(e => [
      e.empresa,
      e.funciones || e.descripcion,
      (e.mesIngreso && e.anioIngreso) ? `${e.mesIngreso} ${e.anioIngreso}` : (e.fecha_inicio || ""),
      e.actualmente ? "Actualidad" : ((e.mesRetiro && e.anioRetiro) ? `${e.mesRetiro} ${e.anioRetiro}` : (e.fecha_fin || ""))
    ])
  );

  // ---- Contacto de un Familiar (no recopilado en el formulario; se deja en blanco para diligenciar a mano) ----
  const contactoFamiliarTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders,
    rows: [
      new TableRow({ children: ["Nombre Completo", "Parentesco", "Celular", "Teléfono"].map(h => headerCell(h, 25)) }),
      new TableRow({ children: [plainCell("", 25), plainCell("", 25), plainCell("", 25), plainCell("", 25)] }),
      new TableRow({ children: [labelValueCell("Quien lo recomienda", "", 100)] }),
      new TableRow({
        children: [
          labelValueCell(
            "Detalle si tiene familiares que trabajan en ARTDECON",
            p.tiene_familiares_empresa === 'Si' ? (p.detalle_familiares_empresa || 'Sí') : 'No',
            65
          ),
          labelValueCell("Viven en la misma casa", "", 35)
        ]
      })
    ]
  });

  // ---- Funciones que puede realizar ----
  const funcionesTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders,
    rows: [
      sectionBarRow("Funciones que puede realizar en ARTDECON", 1),
      new TableRow({ children: [plainCell(p.funciones_desempenar || "", 100)] }),
      sectionBarRow("Detalle otros oficios, arte o trabajo que puede desempeñar", 1),
      new TableRow({ children: [plainCell((p.habilidades && p.habilidades.otros || []).join(", "), 100)] })
    ]
  });

  // ---- Información llenada por Talento Humano (en blanco, uso interno) ----
  const talentoHumanoTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders,
    rows: [
      sectionBarRow("Información llenada por Talento Humano", 2),
      new TableRow({ children: [labelValueCell("Condiciones salariales", "", 60), labelValueCell("Sección", "", 40)] }),
      new TableRow({ children: [labelValueCell("Sede", "", 50), labelValueCell("Producción / Administración", "", 50)] }),
      new TableRow({ children: [labelValueCell("Empresa", "", 50), labelValueCell("Es vacante inclusiva (Si/No)", "", 50)] }),
      new TableRow({ children: [labelValueCell("Observación", "", 100)] })
    ]
  });

  const spacer = () => new Paragraph({ text: "", spacing: { before: 100, after: 100 } });

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          letterheadTable,
          spacer(),
          cargoFechaTable,
          datosPersonalesTable,
          spacer(),
          new Paragraph({ children: [new TextRun({ text: `PERSONAS A CARGO (Nº ${personasACargo.length})`, bold: true, size: 20, font: "Arial" })] }),
          personasTable,
          spacer(),
          new Paragraph({ children: [new TextRun({ text: "ESTUDIOS", bold: true, size: 20, font: "Arial" })] }),
          estudiosTable,
          spacer(),
          new Paragraph({ children: [new TextRun({ text: "EXPERIENCIA LABORAL", bold: true, size: 20, font: "Arial" })] }),
          experienciaTable,
          spacer(),
          new Paragraph({ children: [new TextRun({ text: "CONTACTO DE UN FAMILIAR", bold: true, size: 20, font: "Arial" })] }),
          contactoFamiliarTable,
          spacer(),
          funcionesTable,
          spacer(),
          talentoHumanoTable,
          spacer(),
          new Paragraph({ spacing: { before: 400 }, children: [new TextRun({ text: "Firma del Aspirante: ______________________________________", size: 18, font: "Arial" })] })
        ]
      }
    ]
  });

  return doc;
}

module.exports = {
  generateDocx,
  generateHojaVidaCorporativaDocx
};
