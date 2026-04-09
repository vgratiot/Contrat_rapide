import React, { useState, useRef, useEffect } from 'react';
import { 
  PlusCircle, 
  Users, 
  Camera, 
  FileText, 
  CheckCircle2, 
  Share2, 
  X, 
  ChevronRight,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import SignatureCanvas from 'react-signature-canvas';
// @ts-ignore
const SignatureCanvasComponent = (SignatureCanvas.default || SignatureCanvas) as any;
import { createWorker } from 'tesseract.js';
import { generateContractPDF } from './lib/pdfGenerator';
import { offlineManager } from './lib/utils';

type Step = 'dashboard' | 'scan' | 'form' | 'signature' | 'success';

export default function App() {
  const [step, setStep] = useState<Step>('dashboard');
  const [workerData, setWorkerData] = useState({
    first_name: '',
    last_name: '',
    dob: '',
    nir: '',
    address: '',
  });
  const [contractData, setContractData] = useState({
    job_title: 'Ouvrier Saisonnier',
    start_date: new Date().toISOString().split('T')[0],
    hourly_rate: 11.65,
    weekly_hours: 35,
  });
  const [signature, setSignature] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingContracts, setPendingContracts] = useState<any[]>([]);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const sigPad = useRef<any>(null);

  useEffect(() => {
    setPendingContracts(offlineManager.getPending());
  }, [step]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Camera error:", err);
      alert("Impossible d'accéder à la caméra");
    }
  };

  const captureAndOCR = async () => {
    setIsProcessing(true);
    const canvas = document.createElement('canvas');
    if (videoRef.current) {
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.filter = 'grayscale(100%) contrast(150%)';
        ctx.drawImage(videoRef.current, 0, 0);
        const imageData = canvas.toDataURL('image/jpeg');
        
        try {
          const worker = await createWorker('fra');
          const { data: { text } } = await worker.recognize(imageData);
          await worker.terminate();
          
          // Simple parsing logic (mock for demo)
          const lines = text.split('\n');
          setWorkerData(prev => ({
            ...prev,
            last_name: lines[0]?.replace('NOM', '').trim() || '',
            first_name: lines[1]?.replace('PRENOM', '').trim() || '',
          }));
          
          setStep('form');
          // Stop camera
          const stream = videoRef.current.srcObject as MediaStream;
          stream.getTracks().forEach(track => track.stop());
        } catch (err) {
          console.error("OCR error:", err);
          setStep('form'); // Fallback to manual entry
        }
      }
    }
    setIsProcessing(false);
  };

  const handleSave = () => {
    const signatureData = sigPad.current.getTrimmedCanvas().toDataURL('image/png');
    setSignature(signatureData);
    
    const fullContract = {
      worker: workerData,
      contract: contractData,
      signature: signatureData,
      employer: {
        company_name: "Domaine des Plaines",
        siret: "123 456 789 00012",
        address: "12 Route des Vignes, 33000 Bordeaux"
      }
    };
    
    offlineManager.saveContract(fullContract);
    setStep('success');
  };

  const handleShare = async () => {
    const employer = {
      company_name: "Domaine des Plaines",
      siret: "123 456 789 00012",
      address: "12 Route des Vignes, 33000 Bordeaux"
    };
    
    const doc = generateContractPDF(workerData, employer, contractData, signature || '');
    const pdfBlob = doc.output('blob');
    const file = new File([pdfBlob], `Contrat_${workerData.last_name}.pdf`, { type: 'application/pdf' });

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: 'Contrat Saisonnier-Easy',
          text: `Bonjour ${workerData.first_name}, voici votre contrat de travail.`,
        });
      } catch (err) {
        console.error("Share error:", err);
        doc.save(`Contrat_${workerData.last_name}.pdf`);
      }
    } else {
      doc.save(`Contrat_${workerData.last_name}.pdf`);
    }
  };

  const handleDownloadDPAE = () => {
    const employer = {
      company_name: "Domaine des Plaines",
      siret: "123 456 789 00012",
    };

    const dpaeData = [
      employer.siret,
      employer.company_name,
      workerData.last_name.toUpperCase(),
      workerData.first_name,
      workerData.nir,
      workerData.dob,
      contractData.start_date,
      contractData.job_title,
      "SAISONNIER",
    ];

    const content = dpaeData.join(';');
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `DPAE_${workerData.last_name}_${contractData.start_date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-md mx-auto min-h-screen bg-white flex flex-col">
      <AnimatePresence mode="wait">
        {step === 'dashboard' && (
          <motion.div 
            key="dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="p-4 flex-1"
          >
            <header className="mb-8 flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-black uppercase tracking-tighter italic">Saisonnier-Easy</h1>
                <p className="text-sm font-bold text-gray-500">Domaine des Plaines</p>
              </div>
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
            </header>

            {pendingContracts.length > 0 && (
              <div className="bg-orange-500 text-white p-4 rounded-2xl mb-6 flex justify-between items-center brutal-shadow">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={20} />
                  <span className="font-black text-sm uppercase">{pendingContracts.length} CONTRATS À SYNCHRONISER</span>
                </div>
                <RefreshCw size={20} className="animate-spin-slow" />
              </div>
            )}

            <button 
              onClick={() => { setStep('scan'); startCamera(); }}
              className="w-full bg-brand-yellow p-8 rounded-3xl border-4 border-black flex flex-col items-center gap-4 brutal-shadow-lg mb-12"
            >
              <PlusCircle size={64} strokeWidth={2.5} />
              <span className="text-2xl font-black text-center uppercase">Scanner un<br/>nouveau saisonnier</span>
            </button>

            <section>
              <h2 className="text-xl font-black mb-4 flex items-center gap-2 italic uppercase">
                <Users size={24} /> Contrats récents
              </h2>
              <div className="space-y-3">
                {pendingContracts.length === 0 ? (
                  <div className="border-4 border-dashed border-gray-200 p-8 rounded-2xl text-center text-gray-400 font-bold">
                    Aucun contrat actif
                  </div>
                ) : (
                  pendingContracts.map((c, i) => (
                    <div key={i} className="border-4 border-black p-4 rounded-2xl flex justify-between items-center bg-gray-50 brutal-shadow">
                      <div>
                        <p className="font-black uppercase">{c.worker.last_name} {c.worker.first_name}</p>
                        <p className="text-xs font-bold text-gray-500 italic">Saisi le {new Date(c.createdAt).toLocaleDateString()}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="bg-orange-100 text-orange-600 text-[10px] font-black px-2 py-1 rounded-full border border-orange-200">OFFLINE</span>
                        <ChevronRight size={20} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </motion.div>
        )}

        {step === 'scan' && (
          <motion.div 
            key="scan"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="bg-black flex-1 flex flex-col relative"
          >
            <button 
              onClick={() => setStep('dashboard')}
              className="absolute top-6 left-6 z-10 text-white bg-black/50 p-2 rounded-full"
            >
              <X size={24} />
            </button>
            
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              className="flex-1 object-cover"
            />
            
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-4/5 h-64 border-4 border-brand-yellow rounded-3xl relative">
                <div className="absolute -top-10 left-0 right-0 text-center text-brand-yellow font-black uppercase text-sm">
                  Cadrez la pièce d'identité
                </div>
              </div>
            </div>

            <div className="p-8 bg-black">
              <button 
                onClick={captureAndOCR}
                disabled={isProcessing}
                className="w-full bg-brand-yellow p-6 rounded-3xl border-4 border-black flex items-center justify-center gap-4 brutal-shadow"
              >
                {isProcessing ? (
                  <RefreshCw className="animate-spin" size={32} />
                ) : (
                  <>
                    <Camera size={32} strokeWidth={2.5} />
                    <span className="text-xl font-black uppercase">Capturer & Analyser</span>
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}

        {step === 'form' && (
          <motion.div 
            key="form"
            initial={{ x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -300, opacity: 0 }}
            className="p-4 flex-1 overflow-y-auto"
          >
            <h2 className="text-2xl font-black mb-8 italic uppercase border-b-4 border-black pb-2">Validation Infos</h2>
            
            <div className="space-y-6 mb-8">
              <div>
                <label className="text-xs font-black text-gray-500 uppercase">Nom</label>
                <input 
                  type="text"
                  value={workerData.last_name}
                  onChange={e => setWorkerData({...workerData, last_name: e.target.value})}
                  className="w-full border-b-4 border-black p-2 text-xl font-bold focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-black text-gray-500 uppercase">Prénom</label>
                <input 
                  type="text"
                  value={workerData.first_name}
                  onChange={e => setWorkerData({...workerData, first_name: e.target.value})}
                  className="w-full border-b-4 border-black p-2 text-xl font-bold focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-black text-gray-500 uppercase">Date de Naissance</label>
                <input 
                  type="date"
                  value={workerData.dob}
                  onChange={e => setWorkerData({...workerData, dob: e.target.value})}
                  className="w-full border-b-4 border-black p-2 text-xl font-bold focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-black text-gray-500 uppercase">N° Sécurité Sociale (NIR)</label>
                <input 
                  type="text"
                  maxLength={15}
                  placeholder="1 85 05 99 235 456"
                  value={workerData.nir}
                  onChange={e => setWorkerData({...workerData, nir: e.target.value})}
                  className="w-full border-b-4 border-black p-2 text-xl font-bold focus:outline-none"
                />
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-2xl border-4 border-black mb-8">
              <h3 className="font-black text-sm uppercase mb-4">Conditions Contrat</h3>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {['Vendanges', 'Récolte', 'Taille', 'Autre'].map(job => (
                  <button 
                    key={job}
                    onClick={() => setContractData({...contractData, job_title: job})}
                    className={`p-3 border-2 border-black font-bold rounded-xl text-sm ${contractData.job_title === job ? 'bg-black text-brand-yellow' : 'bg-white'}`}
                  >
                    {job}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between bg-white p-3 rounded-xl border-2 border-black">
                <span className="font-black text-xs uppercase">Salaire (Brut/h)</span>
                <span className="font-black text-lg">11.65€</span>
              </div>
            </div>

            <button 
              onClick={() => setStep('signature')}
              className="w-full bg-black text-brand-yellow p-6 rounded-3xl font-black text-xl uppercase brutal-shadow"
            >
              Étape Signature
            </button>
          </motion.div>
        )}

        {step === 'signature' && (
          <motion.div 
            key="signature"
            initial={{ x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -300, opacity: 0 }}
            className="p-4 flex-1 flex flex-col"
          >
            <h2 className="text-2xl font-black mb-8 italic uppercase border-b-4 border-black pb-2">Signature</h2>
            
            <p className="text-xs font-bold text-gray-500 mb-2 uppercase">Le travailleur signe ci-dessous :</p>
            <div className="border-4 border-black rounded-3xl overflow-hidden bg-gray-50 mb-6 h-64">
              <SignatureCanvasComponent 
                ref={sigPad}
                canvasProps={{ className: "w-full h-full" }}
              />
            </div>

            <div className="bg-yellow-50 p-4 rounded-2xl border-2 border-yellow-200 mb-8 italic text-[10px] text-gray-600">
              "Le salarié reconnaît avoir reçu un exemplaire du présent contrat au moment de sa signature. Ce contrat est conclu en application de l'article L.1242-2 du Code du travail."
            </div>

            <div className="grid grid-cols-2 gap-4 mt-auto">
              <button 
                onClick={() => sigPad.current.clear()}
                className="p-4 border-4 border-black rounded-2xl font-black uppercase brutal-shadow"
              >
                Effacer
              </button>
              <button 
                onClick={handleSave}
                className="p-4 bg-black text-brand-yellow rounded-2xl font-black uppercase brutal-shadow"
              >
                Valider
              </button>
            </div>
          </motion.div>
        )}

        {step === 'success' && (
          <motion.div 
            key="success"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="p-6 flex-1 flex flex-col items-center justify-center text-center"
          >
            <div className="w-32 h-32 bg-green-100 rounded-full flex items-center justify-center mb-8 border-8 border-green-500">
              <CheckCircle2 size={64} className="text-green-600" />
            </div>
            
            <h1 className="text-4xl font-black italic uppercase mb-2">Engagé !</h1>
            <p className="font-bold text-gray-500 uppercase text-sm mb-12">Contrat généré avec succès</p>

            <div className="w-full space-y-4">
              <button 
                onClick={handleShare}
                className="w-full bg-brand-blue text-white p-6 rounded-3xl flex flex-col items-center gap-1 brutal-shadow-lg"
              >
                <div className="flex items-center gap-2">
                  <Share2 size={24} strokeWidth={3} />
                  <span className="text-xl font-black uppercase italic">Envoyer au salarié</span>
                </div>
                <span className="text-[10px] font-bold opacity-80 uppercase">SMS, WhatsApp, Email</span>
              </button>

              <button 
                onClick={handleDownloadDPAE}
                className="w-full border-4 border-black p-5 rounded-3xl flex items-center justify-center gap-3 font-black uppercase brutal-shadow"
              >
                <FileText size={24} />
                <span>Télécharger DPAE</span>
              </button>

              <button 
                onClick={() => setStep('dashboard')}
                className="w-full py-4 text-gray-500 font-bold underline uppercase text-xs"
              >
                Retour à l'accueil
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
