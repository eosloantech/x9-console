import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api, formatAmount } from '../api.js';
import { QRImage, ProblemBox } from '../components.jsx';

export default function PlacardView() {
  const { id } = useParams();
  const [qr, setQr] = useState(null);
  const [problem, setProblem] = useState(null);

  useEffect(() => {
    api.get(id).then(setQr, (e) => setProblem(e.problem || { title: e.message }));
  }, [id]);

  if (problem) return <div className="max-w-xl"><ProblemBox problem={problem} /></div>;
  if (!qr) return <div className="text-ink/40 text-sm">Carregando…</div>;

  const amount = qr.bill?.amountDue ? formatAmount(qr.bill.amountDue.amount, qr.bill.amountDue.currency) : null;
  const rails = [...new Set((qr.paymentMethods || []).flatMap((m) => Object.keys(m.networks || {})))];

  return (
    <div>
      {/* controles — somem na impressão */}
      <div className="print:hidden flex items-center justify-between mb-8">
        <Link to={`/qr/${id}`} className="text-xs font-bold text-ink/40 hover:text-ink transition-colors">← Voltar ao detalhe</Link>
        <button onClick={() => window.print()}
          className="px-6 py-2.5 rounded-xl bg-petrol-600 text-white text-sm font-bold hover:bg-petrol-700 transition-all active:scale-[0.98]">
          Imprimir plaquinha
        </button>
      </div>

      {/* a plaquinha — A5-ish, centrada */}
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.55, ease: [0.4, 0, 0.2, 1] }}
        className="placard mx-auto max-w-[420px] bg-white rounded-[28px] border border-ink/10 shadow-sm overflow-hidden print:shadow-none print:border-ink/20"
      >
        {/* faixa superior — gradiente assinatura Eos */}
        <div className="eos-band px-8 pt-7 pb-6 text-white">
          <span className="inline-flex items-center bg-white rounded-lg px-2.5 py-1.5">
            <img src="/eos-logo.svg" alt="Eos Loan" className="h-5 w-auto" />
          </span>
          <h1 className="font-display font-extrabold text-[26px] leading-tight mt-3">{qr.creditor?.name}</h1>
          {qr.bill?.description && (
            <p className="text-white/65 text-sm mt-0.5">{qr.bill.description}</p>
          )}
        </div>

        {/* QR com a marca no centro (correção de erro H) */}
        <div className="px-8 py-7 flex flex-col items-center">
          <div className="rounded-2xl border-[3px] border-navy p-3.5">
            <QRImage emv={qr.qrCode} size={252} logo />
          </div>

          <div className="mt-6 text-center">
            {amount ? (
              <div className="font-display text-4xl tracking-tight">{amount}</div>
            ) : (
              <div className="font-display text-2xl text-ink/60">Você escolhe o valor</div>
            )}
            {qr.bill?.tip?.allowed && (
              <div className="mt-1 text-xs font-semibold text-ink/45">+ gorjeta opcional no app</div>
            )}
          </div>

          <p className="mt-5 text-center text-[13px] font-semibold text-ink/60 leading-snug max-w-[260px]">
            Escaneie com o aplicativo do seu banco
            <span className="block text-[11px] font-medium text-ink/35 mt-1">
              a câmera comum não abre este código — e é isso que o torna seguro
            </span>
          </p>
        </div>

        {/* rodapé */}
        <div className="border-t border-dashed border-line px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex flex-wrap gap-1.5">
              {rails.map((r) => (
                <span key={r} className="px-2 py-0.5 rounded-md bg-[#D6E7FA] text-navy text-[9px] font-bold uppercase tracking-widest">{r}</span>
              ))}
            </div>
            <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-mute/70">X9.150</span>
          </div>
          <div className="mt-2 text-[8px] font-semibold tracking-wide text-mute/70">
            Eos Loan · NMLS #2744537
          </div>
        </div>
      </motion.div>

      <style>{`
        @media print {
          @page { size: A5 portrait; margin: 12mm; }
          body { background: #fff !important; }
          header, footer, svg[aria-hidden] { display: none !important; }
          main { padding: 0 !important; max-width: none !important; }
          .placard { max-width: 100% !important; }
        }
      `}</style>
    </div>
  );
}
