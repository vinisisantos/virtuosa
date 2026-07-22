"use client";

import React, { useState, useEffect } from "react";
import AuthGuard from "@/components/auth-guard";
import { Loader2, Users, TrendingUp, Briefcase, ChevronDown, ChevronUp } from "lucide-react";
import { useGlobalUnit } from "@/contexts/UnitContext";

interface Breakdown {
  unit: string;
  value: number;
  dealsCount: number;
}

interface UserPerformance {
  id: string;
  name: string;
  role: string;
  email: string;
  totalValue: number;
  totalDeals: number;
  breakdown: Breakdown[];
}

export default function TeamPerformancePage() {
  const [data, setData] = useState<UserPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { allUnits } = useGlobalUnit();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch("/api/analytics/team-performance");
        const json = await res.json();
        if (json.performance) {
          setData(json.performance);
        }
      } catch (err) {
        console.error("Erro ao buscar performance", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
  };

  return (
    <AuthGuard allowedRoles={["ADMINISTRADOR"]}>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Users className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Performance da Equipe</h1>
            <p className="text-sm text-muted-foreground">Visão Global de Vendas Multi-Filial</p>
          </div>
        </div>

        <div className="bg-card border border-border/50 rounded-xl shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : data.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <TrendingUp className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">Nenhuma performance registrada.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {data.map((user) => (
                <div key={user.id} className="flex flex-col">
                  {/* Linha principal */}
                  <div 
                    onClick={() => setExpandedId(expandedId === user.id ? null : user.id)}
                    className="flex items-center justify-between p-5 hover:bg-muted/30 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary font-bold">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">{user.name}</p>
                        <p className="text-xs text-muted-foreground">{user.role} • {user.email}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">{formatCurrency(user.totalValue)}</p>
                        <p className="text-xs text-muted-foreground">{user.totalDeals} vendas concluídas</p>
                      </div>
                      <button className="text-muted-foreground hover:text-foreground transition-colors">
                        {expandedId === user.id ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  {/* Detalhamento (Breakdown) */}
                  {expandedId === user.id && (
                    <div className="bg-muted/10 border-t border-border/50 p-5 pl-[84px]">
                      <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
                        <Briefcase className="w-4 h-4" />
                        Detalhamento por Unidade
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {allUnits.map(unit => {
                          if (unit === "") return null;
                          const b = user.breakdown.find(x => x.unit === unit);
                          const val = b ? b.value : 0;
                          const count = b ? b.dealsCount : 0;
                          
                          return (
                            <div key={unit} className="bg-card border border-border rounded-lg p-4">
                              <p className="text-sm font-medium text-muted-foreground mb-1">{unit}</p>
                              <p className="text-lg font-bold text-foreground">{formatCurrency(val)}</p>
                              <p className="text-xs text-muted-foreground">{count} vendas</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AuthGuard>
  );
}
