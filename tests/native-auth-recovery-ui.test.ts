import { afterEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import AuthRecoveryPanel from '@/components/auth-recovery-panel';
vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => React.createElement('a', { href }, children) }));
afterEach(() => vi.unstubAllGlobals());
it('renders accessible request controls, native-only fallback, and disables token completion until loaded', () => {
  const request = renderToStaticMarkup(React.createElement(AuthRecoveryPanel,{mode:'request',native:true}));
  expect(request).toContain('type="email"'); expect(request).toContain('maxLength="254"');
  expect(request).toContain('Şifre sıfırlama bağlantısı iste'); expect(request).toContain('Doğrulama e-postasını tekrar iste');
  const reset = renderToStaticMarkup(React.createElement(AuthRecoveryPanel,{mode:'reset',native:true}));
  expect(reset.match(/autoComplete="new-password"/g)).toHaveLength(2); expect(reset).toContain('disabled=""');
  const verify = renderToStaticMarkup(React.createElement(AuthRecoveryPanel,{mode:'verify',native:true}));
  expect(verify).toContain('Doğrula'); expect(verify).toContain('disabled=""');
  const other = renderToStaticMarkup(React.createElement(AuthRecoveryPanel,{mode:'request',native:false}));
  expect(other).not.toContain('<form'); expect(other).toContain('yalnız native hesaplar');
});
