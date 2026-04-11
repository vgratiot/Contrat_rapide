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

type Step = 'dashboard' | 'scan' | 'form' | 'signature' | 'success' | 'sync' | 'settings';

export default function App() {
  const [step, setStep] = useState<Step>('dashboard');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResults, setSyncResults] = useState<Record<number, 'loading' | 'success' | 'error'>>({});
  const [employerInfo, setEmployerInfo] = useState(offlineManager.getEmployer());
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
        // Amélioration de l'image pour l'OCR
        ctx.filter = 'grayscale(100%) contrast(150%) brightness(110%)';
        ctx.drawImage(videoRef.current, 0, 0);
        const imageData = canvas.toDataURL('image/jpeg', 0.9);
        
        try {
          const worker = await createWorker('fra');
          const { data: { text } } = await worker.recognize(imageData);
          await worker.terminate();
          
          console.log("OCR Raw Text:", text);
          
          // Logique de parsing améliorée
          const lines = text.split('\n').map(l => l.trim().toUpperCase()).filter(l => l.length > 0);
          
          let lastName = '';
          let firstName = '';
          let dob = '';

          // Recherche de mots clés courants sur les CNI
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.includes('NOM') && !lastName) {
              lastName = line.replace(/NOM[:\s]*/, '').trim();
              if (!lastName && i + 1 < lines.length) lastName = lines[i+1];
            }
            if ((line.includes('PRENOM') || line.includes('PRÉNOM')) && !firstName) {
              firstName = line.replace(/PR[EÉ]NOMS?[:\s]*/, '').split(' ')[0].trim();
              if (!firstName && i + 1 < lines.length) firstName = lines[i+1].split(' ')[0];
            }
            // Recherche de date (format DD.MM.YYYY ou DD/MM/YYYY)
            const dateMatch = line.match(/(\d{2})[\.\/\s](\d{2})[\.\/\s](\d{4})/);
            if (dateMatch && !dob) {
              dob = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
            }
          }

          setWorkerData(prev => ({
            ...prev,
            last_name: lastName || lines[0] || '',
            first_name: firstName || lines[1] || '',
            dob: dob || prev.dob
          }));
          
          setStep('form');
          // Stop camera
          const stream = videoRef.current.srcObject as MediaStream;
          if (stream) {
            stream.getTracks().forEach(track => track.stop());
          }
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
      employer: employerInfo
    };
    
    offlineManager.saveContract(fullContract);
    setStep('success');
  };

  const handleShare = async () => {
    try {
      const doc = generateContractPDF(workerData, employerInfo, contractData, signature || '');
      const pdfBlob = doc.output('blob');
      const fileName = `Contrat_${workerData.last_name || 'Saisonnier'}.pdf`;
      const file = new File([pdfBlob], fileName, { type: 'application/pdf' });

      // Vérification rigoureuse du support de partage
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Contrat Saisonnier-Easy',
          text: `Bonjour ${workerData.first_name}, voici votre contrat de travail.`,
        });
      } else {
        // Fallback immédiat si le partage n'est pas supporté
        doc.save(fileName);
      }
    } catch (err) {
      console.error("Share/Download error:", err);
      // Fallback de secours ultime
      const doc = generateContractPDF(workerData, employerInfo, contractData, signature || '');
      doc.save(`Contrat_${workerData.last_name || 'Saisonnier'}.pdf`);
    }
  };

  const handleSyncAll = async () => {
    setIsSyncing(true);
    const contracts = [...pendingContracts];
    
    for (const contract of contracts) {
      try {
        setSyncResults(prev => ({ ...prev, [contract.id]: 'loading' }));
        
        // Simuler un envoi vers Supabase (puisqu'on utilise des placeholders)
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Si on avait une vraie config Supabase, on ferait :
        /*
        const { error } = await supabase.from('contracts').insert([contract]);
        if (error) throw error;
        */
        
        offlineManager.removeSynced(contract.id);
        setSyncResults(prev => ({ ...prev, [contract.id]: 'success' }));
      } catch (error) {
        console.error("Sync error:", error);
        setSyncResults(prev => ({ ...prev, [contract.id]: 'error' }));
      }
    }
    
    setIsSyncing(false);
    setPendingContracts(offlineManager.getPending());
  };
  const handleDownloadDPAE = () => {
    const dpaeData = [
      employerInfo.siret,
      employerInfo.company_name,
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
                <p className="text-sm font-bold text-gray-500">{employerInfo.company_name}</p>
              </div>
              <button 
                onClick={() => setStep('settings')}
                className="p-2 border-4 border-black rounded-full brutal-shadow bg-white"
              >
                <Users size={20} />
              </button>
            </header>

            {pendingContracts.length > 0 && (
              <div 
                onClick={() => setStep('sync')}
                className="bg-orange-500 text-white p-4 rounded-2xl mb-6 flex justify-between items-center brutal-shadow cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle size={20} />
                  <span className="font-black text-sm uppercase">{pendingContracts.length} CONTRATS À SYNCHRONISER</span>
                </div>
                <RefreshCw size={20} className={isSyncing ? "animate-spin" : ""} />
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 mb-8">
              <button 
                onClick={() => { setStep('scan'); startCamera(); }}
                className="w-full bg-brand-yellow p-6 rounded-3xl border-4 border-black flex flex-col items-center gap-2 brutal-shadow-lg"
              >
                <Camera size={40} strokeWidth={2.5} />
                <span className="text-xl font-black text-center uppercase">Scanner Pièce d'identité</span>
              </button>

              <button 
                onClick={() => {
                  setWorkerData({ first_name: '', last_name: '', dob: '', nir: '', address: '' });
                  setStep('form');
                }}
                className="w-full bg-white p-6 rounded-3xl border-4 border-black flex flex-col items-center gap-2 brutal-shadow-lg"
              >
                <PlusCircle size={40} strokeWidth={2.5} />
                <span className="text-xl font-black text-center uppercase">Saisie Manuelle</span>
              </button>
            </div>

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

            <div className="p-8 bg-black space-y-4">
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
              
              <button 
                onClick={() => {
                  setWorkerData({ first_name: '', last_name: '', dob: '', nir: '', address: '' });
                  setStep('form');
                  // Stop camera
                  if (videoRef.current && videoRef.current.srcObject) {
                    const stream = videoRef.current.srcObject as MediaStream;
                    stream.getTracks().forEach(track => track.stop());
                  }
                }}
                className="w-full bg-white p-4 rounded-2xl border-4 border-black flex items-center justify-center gap-2 font-black uppercase brutal-shadow"
              >
                Passer en saisie manuelle
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
              
              <div className="mb-4">
                <label className="text-[10px] font-black text-gray-500 uppercase mb-1 block">Date d'effet (Début)</label>
                <input 
                  type="date"
                  value={contractData.start_date}
                  onChange={e => setContractData({...contractData, start_date: e.target.value})}
                  className="w-full border-2 border-black p-2 rounded-xl font-bold focus:outline-none bg-white"
                />
              </div>

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
                <div className="flex items-center gap-2">
                  <input 
                    type="number"
                    step="0.01"
                    value={contractData.hourly_rate}
                    onChange={e => setContractData({...contractData, hourly_rate: parseFloat(e.target.value) || 0})}
                    className="w-20 text-right font-black text-lg focus:outline-none bg-transparent"
                  />
                  <span className="font-black text-lg">€</span>
                </div>
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
        {step === 'sync' && (
          <motion.div 
            key="sync"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="p-4 flex-1 flex flex-col"
          >
            <header className="flex items-center gap-4 mb-8">
              <button onClick={() => setStep('dashboard')} className="p-2 border-4 border-black rounded-full brutal-shadow">
                <X size={24} />
              </button>
              <h1 className="text-2xl font-black italic uppercase">Synchronisation</h1>
            </header>

            {pendingContracts.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <CheckCircle2 size={80} className="text-green-500 mb-4" />
                <p className="font-black text-xl">Tout est à jour !</p>
                <button 
                  onClick={() => setStep('dashboard')}
                  className="mt-6 font-black underline uppercase"
                >
                  Retour
                </button>
              </div>
            ) : (
              <>
                <div className="bg-white border-4 border-black rounded-3xl p-6 mb-6 brutal-shadow">
                  <p className="text-lg font-bold mb-2">{pendingContracts.length} contrat(s) en attente.</p>
                  <p className="text-xs text-gray-500 font-bold italic">Connectez-vous au Wi-Fi pour envoyer les données.</p>
                </div>

                <div className="space-y-4 flex-1 overflow-y-auto mb-4">
                  {pendingContracts.map((c) => (
                    <div key={c.id} className="bg-white border-2 border-black p-4 rounded-xl flex justify-between items-center">
                      <div>
                        <p className="font-black uppercase">{c.worker.last_name} {c.worker.first_name}</p>
                        <p className="text-xs text-gray-500 font-bold italic">Saisi le {new Date(c.createdAt).toLocaleDateString()}</p>
                      </div>
                      
                      {syncResults[c.id] === 'loading' && <RefreshCw className="animate-spin text-brand-yellow" />}
                      {syncResults[c.id] === 'success' && <CheckCircle2 className="text-green-500" />}
                      {syncResults[c.id] === 'error' && <AlertTriangle className="text-red-500" />}
                      {!syncResults[c.id] && <RefreshCw className="text-gray-300" />}
                    </div>
                  ))}
                </div>

                <button 
                  onClick={handleSyncAll}
                  disabled={isSyncing}
                  className={`w-full py-6 rounded-3xl font-black text-2xl brutal-shadow-lg border-4 border-black ${
                    isSyncing ? 'bg-gray-400' : 'bg-brand-yellow'
                  }`}
                >
                  {isSyncing ? 'ENVOI EN COURS...' : 'TOUT ENVOYER'}
                </button>
              </>
            )}
          </motion.div>
        )}
        {step === 'settings' && (
          <motion.div 
            key="settings"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="p-4 flex-1 flex flex-col overflow-y-auto"
          >
            <header className="flex items-center gap-4 mb-8">
              <button onClick={() => setStep('dashboard')} className="p-2 border-4 border-black rounded-full brutal-shadow">
                <X size={24} />
              </button>
              <h1 className="text-2xl font-black italic uppercase">Paramètres</h1>
            </header>

            <div className="space-y-6 mb-8">
              <div>
                <label className="text-xs font-black text-gray-500 uppercase">Nom de l'exploitation</label>
                <input 
                  type="text"
                  value={employerInfo.company_name}
                  onChange={e => setEmployerInfo({...employerInfo, company_name: e.target.value})}
                  className="w-full border-b-4 border-black p-2 text-xl font-bold focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-black text-gray-500 uppercase">SIRET</label>
                <input 
                  type="text"
                  value={employerInfo.siret}
                  onChange={e => setEmployerInfo({...employerInfo, siret: e.target.value})}
                  className="w-full border-b-4 border-black p-2 text-xl font-bold focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-black text-gray-500 uppercase">Adresse</label>
                <input 
                  type="text"
                  value={employerInfo.address}
                  onChange={e => setEmployerInfo({...employerInfo, address: e.target.value})}
                  className="w-full border-b-4 border-black p-2 text-xl font-bold focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-black text-gray-500 uppercase">Clause personnalisée du contrat</label>
                <textarea 
                  value={employerInfo.custom_clause}
                  onChange={e => setEmployerInfo({...employerInfo, custom_clause: e.target.value})}
                  className="w-full border-4 border-black p-2 text-sm font-bold focus:outline-none h-32 bg-gray-50 rounded-xl"
                  placeholder="Ex: Le présent contrat est conclu au titre de l'article L.1242-2..."
                />
              </div>
            </div>

            <button 
              onClick={() => {
                offlineManager.saveEmployer(employerInfo);
                setStep('dashboard');
              }}
              className="w-full bg-black text-brand-yellow p-6 rounded-3xl font-black text-xl uppercase brutal-shadow mt-auto"
            >
              Enregistrer
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
