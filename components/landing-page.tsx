import React from 'react';
import { CheckCircle2, Receipt, ShieldCheck, Zap, Globe, ArrowRight, Users } from 'lucide-react';
import Link from 'next/link';

export default function LandingPage() {
    return (
        <div className="min-h-screen bg-white text-slate-900 selection:bg-blue-100">
            {/* --- NAV BAR --- */}
            <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-slate-100">
                <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                            <Receipt className="text-white w-5 h-5" />
                        </div>
                        <span className="text-xl font-bold tracking-tight">BillFlow</span>
                    </div>
                    <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
                        <a href="#features" className="hover:text-blue-600 transition">Fonctionnalités</a>
                        <a href="#pricing" className="hover:text-blue-600 transition">Tarifs</a>
                        <a href="#security" className="hover:text-blue-600 transition">Sécurité</a>
                    </div>
                    <div className="flex items-center gap-4">
                        <button className="text-sm font-semibold hover:text-blue-600 transition">
                            <Link href="/login">Connexion</Link>
                        </button>
                        <button className="bg-slate-900 text-white px-4 py-2 rounded-full text-sm font-semibold hover:bg-slate-800 transition">
                            <Link href="/register">Inscription</Link>

                        </button>
                    </div>
                </div>
            </nav>

            {/* --- HERO SECTION --- */}
            <section className="pt-32 pb-20 px-6">
                <div className="max-w-5xl mx-auto text-center">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold mb-8 animate-fade-in">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600"></span>
                        </span>
                        DISPONIBLE : MULTI-ORGANISATIONS
                    </div>
                    <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-slate-900 mb-6">
                        Facturez vos clients <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-500">
                            en un clin d'œil.
                        </span>
                    </h1>
                    <p className="text-lg md:text-xl text-slate-500 max-w-2xl mx-auto mb-10 leading-relaxed">
                        La plateforme de facturation simple, rapide et sécurisée pour les indépendants modernes. Gérez vos devis, vos factures et vos paiements au même endroit.
                    </p>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                        <button className="w-full sm:w-auto bg-blue-600 text-white px-8 py-4 rounded-2xl font-bold text-lg hover:bg-blue-700 transition-all flex items-center justify-center gap-2 group">
                            Commencer maintenant
                            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </button>
                        <button className="w-full sm:w-auto bg-white border border-slate-200 text-slate-600 px-8 py-4 rounded-2xl font-bold text-lg hover:bg-slate-50 transition">
                            Voir la démo
                        </button>
                    </div>
                </div>
            </section>

            {/* --- DASHBOARD PREVIEW --- */}
            <section className="px-6 pb-20">
                <div className="max-w-6xl mx-auto rounded-3xl border border-slate-200 bg-slate-50 p-4 shadow-2xl">
                    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden aspect-video flex items-center justify-center text-slate-300">
                        {/* Remplace par une capture de ton app */}
                        <p className="italic">[Aperçu du Dashboard Prisma / Better-Auth]</p>
                    </div>
                </div>
            </section>

            {/* --- FEATURES BENTO GRID --- */}
            <section id="features" className="py-24 px-6 bg-slate-50">
                <div className="max-w-7xl mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl font-bold mb-4">Tout ce dont vous avez besoin</h2>
                        <p className="text-slate-500">Conçu pour la performance, sans le superflu.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Feature 1 */}
                        <div className="bg-white p-8 rounded-3xl border border-slate-200 hover:border-blue-300 transition-colors">
                            <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center mb-6 text-blue-600">
                                <Users className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-bold mb-3">Multi-Tenant</h3>
                            <p className="text-slate-500 text-sm leading-relaxed">
                                Gérez plusieurs entités ou entreprises avec un seul compte. Basculez d'une organisation à l'autre instantanément.
                            </p>
                        </div>

                        {/* Feature 2 */}
                        <div className="bg-white p-8 rounded-3xl border border-slate-200 hover:border-blue-300 transition-colors">
                            <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center mb-6 text-emerald-600">
                                <Zap className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-bold mb-3">Paiements Rapides</h3>
                            <p className="text-slate-500 text-sm leading-relaxed">
                                Intégration Stripe pour être payé par carte ou virement directement depuis le lien de la facture.
                            </p>
                        </div>

                        {/* Feature 3 */}
                        <div className="bg-white p-8 rounded-3xl border border-slate-200 hover:border-blue-300 transition-colors">
                            <div className="w-12 h-12 bg-purple-100 rounded-2xl flex items-center justify-center mb-6 text-purple-600">
                                <ShieldCheck className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-bold mb-3">Sécurité 2FA</h3>
                            <p className="text-slate-500 text-sm leading-relaxed">
                                Grâce à Better-Auth, profitez d'une sécurité maximale avec authentification à deux facteurs et OTP.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* --- CTA FINALE --- */}
            <section className="py-24 px-6">
                <div className="max-w-4xl mx-auto bg-slate-900 rounded-[3rem] p-12 md:p-20 text-center relative overflow-hidden">
                    <div className="relative z-10">
                        <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">
                            Prêt à automatiser votre <br /> facturation ?
                        </h2>
                        <p className="text-slate-400 mb-10 text-lg">
                            Rejoignez les entrepreneurs qui gagnent 5h par semaine.
                        </p>
                        <button className="bg-white text-slate-900 px-8 py-4 rounded-full font-bold text-lg hover:bg-slate-100 transition">
                            Démarrer gratuitement
                        </button>
                    </div>
                    {/* Décoration abstraite */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/20 blur-[100px] -mr-32 -mt-32"></div>
                    <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-600/20 blur-[100px] -ml-32 -mb-32"></div>
                </div>
            </section>

            {/* --- FOOTER --- */}
            <footer className="py-12 px-6 border-t border-slate-100 text-center text-slate-400 text-sm">
                <p>&copy; 2026 BillFlow. Fait avec passion pour les créateurs.</p>
            </footer>
        </div>
    );
}