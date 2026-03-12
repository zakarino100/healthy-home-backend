import React, { ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("glass-panel rounded-2xl p-6 sm:p-8 hover-lift", className)} {...props}>
      {children}
    </div>
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "destructive";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
}

export function Button({ className, variant = "primary", size = "md", isLoading, children, disabled, ...props }: ButtonProps) {
  const baseStyles = "inline-flex items-center justify-center font-semibold rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none active:scale-[0.98]";
  
  const variants = {
    primary: "bg-gradient-to-r from-primary to-emerald-500 text-white shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5 focus:ring-primary",
    secondary: "bg-slate-900 text-white shadow-lg shadow-slate-900/20 hover:shadow-xl hover:-translate-y-0.5 focus:ring-slate-900",
    outline: "bg-white border-2 border-slate-200 text-slate-700 hover:border-primary hover:text-primary focus:ring-primary",
    ghost: "bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:ring-slate-200",
    destructive: "bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-lg shadow-red-500/25 hover:shadow-xl hover:-translate-y-0.5 focus:ring-red-500",
  };

  const sizes = {
    sm: "px-4 py-2 text-sm",
    md: "px-6 py-3 text-base",
    lg: "px-8 py-4 text-lg",
  };

  return (
    <button 
      className={cn(baseStyles, variants[variant], sizes[size], className)} 
      disabled={isLoading || disabled}
      {...props}
    >
      {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
      {children}
    </button>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input 
      className={cn(
        "flex w-full px-4 py-3 rounded-xl bg-slate-50/50 border-2 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/10 transition-all duration-200",
        className
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "flex w-full px-4 py-3 rounded-xl bg-slate-50/50 border-2 border-slate-200 text-slate-900 focus:outline-none focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/10 transition-all duration-200 appearance-none cursor-pointer",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Label({ className, children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cn("block text-sm font-bold text-slate-700 mb-1.5", className)} {...props}>
      {children}
    </label>
  );
}

export function Badge({ children, variant = "default", className }: { children: React.ReactNode, variant?: "default" | "success" | "warning" | "destructive" | "neutral", className?: string }) {
  const variants = {
    default: "bg-primary/10 text-primary border-primary/20",
    success: "bg-emerald-100 text-emerald-800 border-emerald-200",
    warning: "bg-amber-100 text-amber-800 border-amber-200",
    destructive: "bg-red-100 text-red-800 border-red-200",
    neutral: "bg-slate-100 text-slate-700 border-slate-200",
  };
  
  return (
    <span className={cn("inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border", variants[variant], className)}>
      {children}
    </span>
  );
}

export function StatCard({ title, value, target, prefix = "", suffix = "", delay = "delay-100" }: { title: string, value: number | string, target?: number, prefix?: string, suffix?: string, delay?: string }) {
  const numericValue = typeof value === 'string' ? parseFloat(value) : value;
  const progress = target && target > 0 ? Math.min((numericValue / target) * 100, 100) : 0;
  const isGood = target ? numericValue >= target : true;

  return (
    <Card className={cn("animate-in-stagger", delay)}>
      <h3 className="text-slate-500 font-medium text-sm tracking-wide uppercase">{title}</h3>
      <div className="mt-4 flex items-end justify-between">
        <div className="flex items-baseline gap-1">
          <span className="text-4xl font-display font-extrabold text-slate-900 tracking-tight">
            {prefix}{value}{suffix}
          </span>
        </div>
        {target !== undefined && (
          <div className="text-right">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Target</span>
            <p className="text-sm font-bold text-slate-700">{prefix}{target}{suffix}</p>
          </div>
        )}
      </div>
      {target !== undefined && (
        <div className="mt-5 h-2 w-full bg-slate-100 rounded-full overflow-hidden relative">
          <div 
            className={cn(
              "absolute top-0 left-0 h-full rounded-full transition-all duration-1000 ease-out",
              isGood ? "bg-primary" : "bg-amber-400"
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </Card>
  );
}

export function PageLoader() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh]">
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 border-4 border-primary/20 rounded-full"></div>
        <div className="absolute inset-0 border-4 border-primary rounded-full border-t-transparent animate-spin"></div>
      </div>
      <p className="mt-4 text-slate-500 font-medium animate-pulse">Loading data...</p>
    </div>
  );
}

export function ErrorState({ error }: { error: any }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] text-center max-w-md mx-auto">
      <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-6 shadow-inner">
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
      </div>
      <h2 className="text-2xl font-bold text-slate-900 mb-2">Something went wrong</h2>
      <p className="text-slate-600 mb-6">{error?.message || "Failed to load data. Please try again."}</p>
      <Button onClick={() => window.location.reload()}>Refresh Page</Button>
    </div>
  );
}

export function Modal({ isOpen, onClose, title, children }: { isOpen: boolean, onClose: () => void, title: string, children: React.ReactNode }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h2 className="text-xl font-display font-bold text-slate-900">{title}</h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-full transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-6 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
