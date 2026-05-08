import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  Packer,
  Paragraph,
  TabStopPosition,
  TabStopType,
  TextRun,
} from 'docx';
import type { ParsedResume } from './parser.service.js';

export class DocxResumeBuilder {
  public async build(resume: ParsedResume): Promise<Buffer> {
    const contactLine = [
      resume.contact.location ?? '',
      resume.contact.phone ?? '',
      resume.contact.email ?? '',
    ]
      .filter(Boolean)
      .join(' | ');

    const linkRuns: Array<TextRun | ExternalHyperlink> = [];
    if (resume.contact.linkedin) {
      linkRuns.push(
        new ExternalHyperlink({
          link: resume.contact.linkedin,
          children: [new TextRun({ text: 'LinkedIn', style: 'Hyperlink' })],
        }),
      );
    }
    if (resume.contact.github) {
      if (linkRuns.length > 0) linkRuns.push(new TextRun({ text: '  |  ' }));
      linkRuns.push(
        new ExternalHyperlink({
          link: resume.contact.github,
          children: [new TextRun({ text: 'GitHub', style: 'Hyperlink' })],
        }),
      );
    }

    const children: Paragraph[] = [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [new TextRun({ text: resume.contact.name ?? 'Candidate', bold: true, size: 32 })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 60 },
        children: [new TextRun({ text: contactLine, size: 19 })],
      }),
    ];

    if (linkRuns.length > 0) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 180 },
          children: linkRuns,
        }),
      );
    } else {
      children.push(new Paragraph({ spacing: { after: 180 }, children: [new TextRun({ text: '' })] }));
    }

    if (resume.summary) {
      children.push(this.sectionHeading('PROFESSIONAL SUMMARY'));
      children.push(
        new Paragraph({
          spacing: { after: 180 },
          children: [new TextRun({ text: resume.summary })],
        }),
      );
    }

    if (resume.experience.length > 0) {
      children.push(this.sectionHeading('PROFESSIONAL EXPERIENCE'));
      for (const exp of resume.experience) {
        children.push(
          new Paragraph({
            spacing: { before: 80, after: 40 },
            tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
            children: [
              new TextRun({ text: exp.company, bold: true }),
              new TextRun({
                text: `\t${exp.startDate} - ${exp.endDate ?? (exp.isCurrent ? 'Present' : 'Present')}`,
                bold: true,
              }),
            ],
          }),
        );
        children.push(
          new Paragraph({
            spacing: { after: 40 },
            children: [
              new TextRun({ text: exp.title, italics: true }),
              exp.location ? new TextRun({ text: ` | ${exp.location}` }) : new TextRun({ text: '' }),
            ],
          }),
        );
        for (const bullet of exp.bullets.slice(0, 10)) {
          children.push(
            new Paragraph({
              spacing: { after: 20 },
              bullet: { level: 0 },
              children: [new TextRun({ text: bullet })],
            }),
          );
        }
        children.push(new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: '' })] }));
      }
    }

    const technicalSkills = [...resume.skills.technical, ...resume.skills.tools]
      .filter(Boolean)
      .slice(0, 24)
      .join(', ');
    const certSkills = [...resume.skills.certifications, ...resume.skills.soft]
      .filter(Boolean)
      .slice(0, 20)
      .join(', ');
    if (technicalSkills || certSkills) {
      children.push(this.sectionHeading('SKILLS'));
      if (technicalSkills) {
        children.push(
          new Paragraph({
            spacing: { after: 40 },
            children: [new TextRun({ text: 'Technical: ', bold: true }), new TextRun({ text: technicalSkills })],
          }),
        );
      }
      if (certSkills) {
        children.push(
          new Paragraph({
            spacing: { after: 150 },
            children: [new TextRun({ text: 'Additional: ', bold: true }), new TextRun({ text: certSkills })],
          }),
        );
      }
    }

    if (resume.education.length > 0) {
      children.push(this.sectionHeading('EDUCATION'));
      for (const edu of resume.education) {
        const degreeLine = [edu.degree, edu.field].filter(Boolean).join(', ');
        const meta = [edu.graduationYear ?? '', edu.gpa ? `GPA ${edu.gpa}` : ''].filter(Boolean).join(' | ');
        children.push(
          new Paragraph({
            spacing: { after: 30 },
            children: [new TextRun({ text: edu.institution, bold: true })],
          }),
        );
        if (degreeLine) {
          children.push(
            new Paragraph({
              spacing: { after: 20 },
              children: [new TextRun({ text: degreeLine })],
            }),
          );
        }
        if (meta) {
          children.push(
            new Paragraph({
              spacing: { after: 120 },
              children: [new TextRun({ text: meta, italics: true })],
            }),
          );
        }
      }
    }

    const doc = new Document({
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: 720,
                right: 720,
                bottom: 720,
                left: 720,
              },
            },
          },
          children,
        },
      ],
    });
    return Packer.toBuffer(doc);
  }

  private sectionHeading(text: string): Paragraph {
    return new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 120, after: 80 },
      border: {
        bottom: {
          color: 'D9D9D9',
          space: 1,
          size: 6,
          style: 'single',
        },
      },
      children: [new TextRun({ text, bold: true, size: 22 })],
    });
  }
}

