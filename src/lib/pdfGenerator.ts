import jsPDF from 'jspdf';

export const generateContractPDF = (worker: any, employer: any, contract: any, signatureBase64: string) => {
  const doc = new jsPDF();
  const margin = 20;
  let y = 20;

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("CONTRAT DE TRAVAIL SAISONNIER", 105, y, { align: "center" });
  
  y += 20;
  doc.setFontSize(11);
  doc.text("ENTRE LES SOUSSIGNÉS :", margin, y);
  
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text([
    `L'EMPLOYEUR : ${employer.company_name}`,
    `SIRET : ${employer.siret}`,
    `Adresse : ${employer.address}`,
  ], margin, y);

  y += 25;
  doc.text([
    `LE SALARIÉ : ${worker.first_name.toUpperCase()} ${worker.last_name.toUpperCase()}`,
    `Né(e) le : ${worker.dob}`,
    `NIR : ${worker.nir || 'En cours'}`,
  ], margin, y);

  y += 35;
  doc.setFont("helvetica", "bold");
  doc.text("CONDITIONS D'ENGAGEMENT :", margin, y);
  
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.text([
    `Poste : ${contract.job_title}`,
    `Date de début : ${contract.start_date}`,
    `Rémunération : ${contract.hourly_rate} € brut / heure`,
  ], margin, y);

  y += 45;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  
  const customClause = employer.custom_clause || "Le présent contrat est conclu au titre de l'article L.1242-2 du Code du Travail.";
  const splitClause = doc.splitTextToSize(customClause, 170);
  doc.text(splitClause, margin, y);
  
  y += (splitClause.length * 5) + 5;
  doc.text("Le salarié reconnaît avoir reçu un exemplaire du présent contrat au moment de sa signature.", margin, y);

  if (signatureBase64) {
    y += 15;
    doc.addImage(signatureBase64, 'PNG', margin, y, 50, 25);
  }

  return doc;
};
