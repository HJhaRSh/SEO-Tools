import { jsPDF } from 'jspdf';
import type { PageFocusReport } from '@/lib/seo/page-focus/types';

/**
 * Generates a professionally branded PDF report for AI Page Focus & Semantic Relevance Analyzer.
 */
export function generatePageFocusPdf(report: PageFocusReport): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  function checkPageBreak(requiredHeight: number) {
    if (y + requiredHeight > pageHeight - margin) {
      doc.addPage();
      y = margin;
      drawHeader();
    }
  }

  function drawHeader() {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(76, 175, 80); // #4caf50 Indian Marketers Green
    doc.text('INDIAN MARKETERS — AI SEO TOOLS SUITE', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(150, 150, 150);
    doc.text('https://indianmarketers.in/tools', pageWidth - margin, y, { align: 'right' });
    y += 5;
    doc.setDrawColor(230, 230, 230);
    doc.setLineWidth(0.3);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;
  }

  // Cover / First Page Header
  drawHeader();

  // Document Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(17, 24, 39); // #111827
  doc.text('AI Page Focus & Semantic Relevance Audit', margin, y);
  y += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(107, 114, 128); // #6b7280
  doc.text(`Generated on ${new Date(report.timestamp).toLocaleString()} | ID: ${report.analysisId.slice(0, 8)}`, margin, y);
  y += 10;

  // Metadata Card Box
  doc.setFillColor(249, 250, 251);
  doc.setDrawColor(229, 231, 235);
  doc.roundedRect(margin, y, contentWidth, 24, 3, 3, 'FD');
  
  doc.setFontSize(9);
  doc.setTextColor(17, 24, 39);
  doc.setFont('helvetica', 'bold');
  doc.text('Target Webpage:', margin + 4, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(55, 65, 81);
  const truncatedUrl = report.targetUrl.length > 70 ? report.targetUrl.slice(0, 67) + '...' : report.targetUrl;
  doc.text(truncatedUrl, margin + 35, y + 6);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(17, 24, 39);
  doc.text('Target Topic:', margin + 4, y + 13);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(55, 65, 81);
  doc.text(report.targetTopic || '(None - Automatic Topic Detection)', margin + 35, y + 13);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(17, 24, 39);
  doc.text('AI Provider:', margin + 4, y + 20);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(55, 65, 81);
  doc.text(`${report.aiProvider.toUpperCase()} | Engine ${report.scoringVersion}`, margin + 35, y + 20);

  y += 32;

  // Overall Score Section (if target topic exists)
  if (report.overallRelevanceScore !== null) {
    checkPageBreak(35);
    doc.setFillColor(240, 253, 244); // light green
    doc.setDrawColor(76, 175, 80);
    doc.roundedRect(margin, y, contentWidth, 28, 3, 3, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(76, 175, 80);
    doc.text('INDIAN MARKETERS TOPIC RELEVANCE INDEX', margin + 6, y + 8);

    doc.setFontSize(24);
    doc.text(`${report.overallRelevanceScore.toFixed(1)} / 100`, margin + 6, y + 21);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(17, 24, 39);
    doc.text(`Rating: ${report.scoreInterpretation || 'Evaluated'}`, margin + 80, y + 14);

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(107, 114, 128);
    doc.text('Weighted 6-component deterministic & semantic vector evaluation', margin + 80, y + 21);

    y += 36;
  }

  // Component Scores Breakdown
  if (report.scoreComponents) {
    checkPageBreak(45);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(17, 24, 39);
    doc.text('Component Scores Breakdown', margin, y);
    y += 6;

    const comps = [
      { name: 'Semantic Similarity (35%)', val: report.scoreComponents.semanticSimilarity },
      { name: 'Search Intent Alignment (20%)', val: report.scoreComponents.searchIntentAlignment },
      { name: 'Topical Coverage (20%)', val: report.scoreComponents.topicalCoverage },
      { name: 'Heading & Structural (10%)', val: report.scoreComponents.headingStructuralAlignment },
      { name: 'Supporting Context Depth (10%)', val: report.scoreComponents.supportingContextDepth },
      { name: 'Topical Coherence (5%)', val: report.scoreComponents.topicalCoherence },
    ];

    doc.setFontSize(8.5);
    for (const c of comps) {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(55, 65, 81);
      doc.text(c.name, margin + 4, y);
      doc.setFont('helvetica', 'bold');
      doc.text(`${c.val} / 100`, margin + contentWidth - 20, y, { align: 'right' });
      
      // Mini score bar
      doc.setFillColor(229, 231, 235);
      doc.rect(margin + 90, y - 3, 50, 3, 'F');
      doc.setFillColor(76, 175, 80);
      doc.rect(margin + 90, y - 3, (c.val / 100) * 50, 3, 'F');

      y += 6;
    }
    y += 6;
  }

  // Page Summary
  checkPageBreak(30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(17, 24, 39);
  doc.text('Page Content Summary', margin, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(55, 65, 81);
  const summaryLines = doc.splitTextToSize(report.pageSummary, contentWidth - 4);
  doc.text(summaryLines, margin + 2, y);
  y += summaryLines.length * 4.5 + 8;

  // Detected Topics
  checkPageBreak(40);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(17, 24, 39);
  doc.text(`Primary Topic: ${report.primaryTopic.name} (${report.primaryTopic.centralityScore}/100 Centrality)`, margin, y);
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(107, 114, 128);
  const primExpl = doc.splitTextToSize(report.primaryTopic.explanation, contentWidth - 4);
  doc.text(primExpl, margin + 2, y);
  y += primExpl.length * 4 + 6;

  if (report.secondaryTopics.length > 0) {
    checkPageBreak(30);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(17, 24, 39);
    doc.text('Secondary Topics Detected:', margin, y);
    y += 5;

    for (const st of report.secondaryTopics.slice(0, 8)) {
      checkPageBreak(8);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(55, 65, 81);
      doc.text(`• ${st.name} (Centrality: ${st.centralityScore}/100) - ${st.explanation.slice(0, 80)}`, margin + 4, y);
      y += 5;
    }
    y += 6;
  }

  // AI Content Improvement Recommendations
  if (report.recommendations.length > 0) {
    checkPageBreak(40);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(17, 24, 39);
    doc.text('Actionable AI Content Recommendations', margin, y);
    y += 6;

    for (let i = 0; i < report.recommendations.length; i++) {
      const rec = report.recommendations[i];
      checkPageBreak(30);

      doc.setFillColor(249, 250, 251);
      doc.setDrawColor(229, 231, 235);
      doc.roundedRect(margin, y, contentWidth, 24, 2, 2, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(rec.priority === 'high' ? 220 : 17, rec.priority === 'high' ? 38 : 24, rec.priority === 'high' ? 38 : 39);
      doc.text(`[${rec.priority.toUpperCase()}] ${rec.title}`, margin + 4, y + 5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(55, 65, 81);
      const issueLine = doc.splitTextToSize(`Issue: ${rec.issue}`, contentWidth - 8);
      doc.text(issueLine.slice(0, 1), margin + 4, y + 10);

      const propLine = doc.splitTextToSize(`Improvement: ${rec.proposedImprovement}`, contentWidth - 8);
      doc.text(propLine.slice(0, 2), margin + 4, y + 15);

      doc.setTextColor(107, 114, 128);
      doc.text(`Rationale: ${rec.seoRationale.slice(0, 85)}...`, margin + 4, y + 21);

      y += 28;
    }
  }

  // Competitor Comparison (if present)
  if (report.competitorReport) {
    checkPageBreak(40);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(17, 24, 39);
    doc.text('Competitor Comparison Analysis', margin, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(55, 65, 81);
    doc.text(`Competitor URL: ${report.competitorReport.competitorUrl.slice(0, 65)}`, margin + 2, y);
    y += 5;
    doc.text(`Our Relevance: ${report.competitorReport.ourScore?.toFixed(1) || 'N/A'} vs Competitor: ${report.competitorReport.competitorScore?.toFixed(1) || 'N/A'}`, margin + 2, y);
    y += 5;
    const verdLines = doc.splitTextToSize(`Verdict: ${report.competitorReport.verdict}`, contentWidth - 4);
    doc.text(verdLines, margin + 2, y);
    y += verdLines.length * 4.5 + 6;

    if (report.competitorReport.topicGaps.length > 0) {
      checkPageBreak(20);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(185, 28, 28);
      doc.text(`Content Gaps (Covered by competitor, missing from page):`, margin + 2, y);
      y += 5;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(55, 65, 81);
      for (const gap of report.competitorReport.topicGaps.slice(0, 5)) {
        doc.text(`- ${gap}`, margin + 6, y);
        y += 4.5;
      }
      y += 4;
    }
  }

  // Footer / Disclaimer
  checkPageBreak(25);
  doc.setDrawColor(230, 230, 230);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(156, 163, 175);
  doc.text(
    'Disclaimer: The Indian Marketers Topic Relevance Index measures semantic focus and topical completeness against search intent. ' +
    'It does not represent Google ranking signals or guarantee search positions. Produced by Indian Marketers SEO Tools.',
    margin,
    y,
    { maxWidth: contentWidth }
  );

  // Save PDF
  const filename = `page-focus-report-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}

