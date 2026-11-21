/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import {
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Terminal,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { CopyButton } from '@/components/copy-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { handleServerError } from '@/lib/handle-server-error'

import { fetchTokenKey, getApiKeys } from '../api'

export type CreatedApiKeySummary = {
  name: string
  count: number
  group: string
  quotaLabel: string
  expiryLabel: string
}

type ApiKeyCreatedViewProps = {
  summary: CreatedApiKeySummary
  baseUrl: string
  onCreateAnother: () => void
  onDone: () => void
}

function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '')
  if (!trimmed) return 'https://api.example.com/v1'
  return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`
}

export function ApiKeyCreatedView(props: ApiKeyCreatedViewProps) {
  const { t } = useTranslation()
  const { copyToClipboard } = useCopyToClipboard({ notify: false })
  const [revealedKey, setRevealedKey] = useState<string | null>(null)
  const [keyVisible, setKeyVisible] = useState(true)
  const [isFetchingKey, setIsFetchingKey] = useState(false)
  const [snippetTab, setSnippetTab] = useState<'curl' | 'python' | 'js'>('curl')

  const apiBaseUrl = useMemo(
    () => normalizeBaseUrl(props.baseUrl),
    [props.baseUrl]
  )

  const handleRevealAndCopy = async () => {
    if (revealedKey) {
      await copyToClipboard(revealedKey)
      toast.success(t('API key copied to clipboard'))
      return
    }

    setIsFetchingKey(true)
    try {
      const listRes = await getApiKeys({ p: 1, size: 10 })
      const items = listRes.data?.items ?? []
      const match =
        items.find((item) => item.name === props.summary.name) ?? items[0]
      if (!match) {
        toast.error(t('Could not locate the newly created API key'))
        return
      }
      const keyRes = await fetchTokenKey(match.id)
      const rawKey = keyRes.data?.key
      if (!keyRes.success || !rawKey) {
        handleServerError(keyRes, t('Failed to reveal API key'))
        return
      }
      const fullKey = rawKey.startsWith('sk-') ? rawKey : `sk-${rawKey}`
      setRevealedKey(fullKey)
      setKeyVisible(true)
      await copyToClipboard(fullKey)
      toast.success(t('API key copied to clipboard'))
    } catch (error) {
      handleServerError(error, t('Failed to reveal API key'))
    } finally {
      setIsFetchingKey(false)
    }
  }

  const snippetKey = revealedKey && keyVisible ? revealedKey : 'YOUR_API_KEY'

  const snippets = useMemo(
    () => ({
      curl: `curl ${apiBaseUrl}/chat/completions \\
  -H "Authorization: Bearer ${snippetKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`,
      python: `from openai import OpenAI

client = OpenAI(
    base_url="${apiBaseUrl}",
    api_key="${snippetKey}",
)

response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "Hello!"}],
)
print(response.choices[0].message.content)`,
      js: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${apiBaseUrl}",
  apiKey: "${snippetKey}",
});

const response = await client.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: "Hello!" }],
});
console.log(response.choices[0].message.content);`,
    }),
    [apiBaseUrl, snippetKey]
  )

  let maskedDisplay = 'sk-••••••••••••••••••••••••••••••••••••••••'
  if (revealedKey) {
    maskedDisplay = keyVisible
      ? revealedKey
      : `${revealedKey.slice(0, 7)}••••••••••••••••••••••••${revealedKey.slice(-4)}`
  }

  return (
    <div className='space-y-5' data-slot='api-key-created-view'>
      <div className='border-emerald-500/25 bg-emerald-500/8 flex items-start gap-3 rounded-xl border p-3.5'>
        <CheckCircle2
          className='mt-0.5 size-5 shrink-0 text-emerald-500'
          aria-hidden='true'
        />
        <div className='min-w-0 flex-1 space-y-1'>
          <p className='text-sm font-semibold'>
            {props.summary.count > 1
              ? t('Successfully created {{count}} API Key(s)', {
                  count: props.summary.count,
                })
              : t('API Key created successfully')}
          </p>
          <div className='text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs'>
            <Badge variant='secondary' className='font-medium'>
              {props.summary.name}
            </Badge>
            <span>·</span>
            <span>{props.summary.group}</span>
            <span>·</span>
            <span>{props.summary.quotaLabel}</span>
            <span>·</span>
            <span>{props.summary.expiryLabel}</span>
          </div>
        </div>
      </div>

      {props.summary.count === 1 ? (
        <div className='space-y-1.5'>
          <div className='flex items-center justify-between gap-2'>
            <span className='flex items-center gap-1.5 text-xs font-medium'>
              <KeyRound
                className='text-muted-foreground size-3.5'
                aria-hidden='true'
              />
              {t('Secret Key')}
            </span>
            <span className='text-muted-foreground text-[11px]'>
              {t('Keep your secret key private and never commit it to code.')}
            </span>
          </div>
          <div className='border-border/80 bg-muted/40 flex items-center gap-2 rounded-lg border px-3 py-2'>
            <code className='min-w-0 flex-1 truncate font-mono text-xs select-all'>
              {maskedDisplay}
            </code>
            {revealedKey ? (
              <>
                <Button
                  type='button'
                  size='icon'
                  variant='ghost'
                  className='size-7'
                  onClick={() => setKeyVisible((v) => !v)}
                  aria-label={keyVisible ? t('Hide key') : t('Show key')}
                >
                  {keyVisible ? (
                    <EyeOff className='size-3.5' aria-hidden='true' />
                  ) : (
                    <Eye className='size-3.5' aria-hidden='true' />
                  )}
                </Button>
                <CopyButton
                  value={revealedKey}
                  variant='outline'
                  size='sm'
                  className='h-7 gap-1 px-2.5 text-xs'
                >
                  {t('Copy')}
                </CopyButton>
              </>
            ) : (
              <Button
                type='button'
                size='sm'
                variant='default'
                className='h-7 gap-1.5 px-3 text-xs'
                disabled={isFetchingKey}
                onClick={() => void handleRevealAndCopy()}
              >
                {isFetchingKey ? (
                  <Loader2
                    className='size-3.5 animate-spin'
                    aria-hidden='true'
                  />
                ) : null}
                {t('Reveal & Copy Key')}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className='border-border/70 bg-muted/30 text-muted-foreground rounded-lg border px-3.5 py-2.5 text-xs'>
          {t(
            'All {{count}} keys have been added to your API Keys list. You can copy each key directly from the table.',
            { count: props.summary.count }
          )}
        </div>
      )}

      <div className='space-y-1.5'>
        <span className='text-xs font-medium'>{t('API Base URL')}</span>
        <div className='border-border/80 bg-muted/40 flex items-center gap-2 rounded-lg border px-3 py-2'>
          <code className='min-w-0 flex-1 truncate font-mono text-xs select-all'>
            {apiBaseUrl}
          </code>
          <CopyButton
            value={apiBaseUrl}
            variant='outline'
            size='sm'
            className='h-7 gap-1 px-2.5 text-xs'
          >
            {t('Copy')}
          </CopyButton>
        </div>
      </div>

      <div className='space-y-2'>
        <Tabs
          value={snippetTab}
          onValueChange={(value) =>
            setSnippetTab(value as 'curl' | 'python' | 'js')
          }
        >
          <div className='flex items-center justify-between gap-2'>
            <div className='flex items-center gap-2'>
              <Terminal
                className='text-muted-foreground size-3.5'
                aria-hidden='true'
              />
              <span className='text-xs font-medium'>{t('Quickstart')}</span>
              <TabsList className='h-7 p-0.5'>
                <TabsTrigger value='curl' className='h-6 px-2 text-[11px]'>
                  cURL
                </TabsTrigger>
                <TabsTrigger value='python' className='h-6 px-2 text-[11px]'>
                  Python
                </TabsTrigger>
                <TabsTrigger value='js' className='h-6 px-2 text-[11px]'>
                  JavaScript
                </TabsTrigger>
              </TabsList>
            </div>
            <CopyButton
              value={snippets[snippetTab]}
              variant='ghost'
              size='sm'
              className='h-7 gap-1 px-2 text-xs'
            >
              {t('Copy')}
            </CopyButton>
          </div>
          {(['curl', 'python', 'js'] as const).map((lang) => (
            <TabsContent key={lang} value={lang} className='mt-2'>
              <pre className='border-border/70 bg-muted/50 max-h-44 overflow-auto rounded-lg border p-3 font-mono text-[11px] leading-relaxed'>
                <code>{snippets[lang]}</code>
              </pre>
            </TabsContent>
          ))}
        </Tabs>
      </div>

      <div className='border-border/60 flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end'>
        <Button
          type='button'
          variant='outline'
          onClick={props.onCreateAnother}
        >
          {t('Create another')}
        </Button>
        <Button type='button' onClick={props.onDone}>
          {t('Done')}
        </Button>
      </div>
    </div>
  )
}
