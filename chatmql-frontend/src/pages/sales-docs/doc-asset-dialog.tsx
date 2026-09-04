/**
 * doc-asset-dialog.tsx — Thêm/sửa một tài nguyên trong thư viện.
 *
 * Ba cách nạp nội dung: tải tệp lên máy chủ, dán đường dẫn ngoài (Drive,
 * YouTube — không tốn ổ đĩa), hoặc gõ thẳng văn bản. Gắn mã sản phẩm để tài
 * nguyên hiện đúng ở trang sản phẩm và để AI tìm được khi khách hỏi.
 */
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Upload, X } from 'lucide-react'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/misc'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { apiError } from '@/lib/api-client'
import {
  KIND_LABELS, VISIBILITY_LABELS, assetUrl, useSaveDocAsset, useUploadDocFile,
  type AssetKind, type DocAsset, type DocFolder, type Visibility,
} from '@/hooks/use-doc-library'

const NO_FOLDER = '__none__'

interface Props {
  asset: DocAsset | null
  folders: DocFolder[]
  defaultFolderId?: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DocAssetDialog({ asset, folders, defaultFolderId, open, onOpenChange }: Props) {
  const save = useSaveDocAsset()
  const upload = useUploadDocFile()
  const fileRef = useRef<HTMLInputElement>(null)

  const [kind, setKind] = useState<AssetKind>('image')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [textContent, setTextContent] = useState('')
  const [fileUrl, setFileUrl] = useState<string | null>(null)
  const [fileSize, setFileSize] = useState<number | null>(null)
  const [mimeType, setMimeType] = useState<string | null>(null)
  const [sourceUrl, setSourceUrl] = useState('')
  const [folderId, setFolderId] = useState<string>(NO_FOLDER)
  const [visibility, setVisibility] = useState<Visibility>('sales')
  const [codes, setCodes] = useState('')

  // Mở lại dialog thì nạp đúng trạng thái: sửa thì lấy từ bản ghi, thêm mới thì trắng.
  useEffect(() => {
    if (!open) return
    setKind(asset?.kind ?? 'image')
    setTitle(asset?.title ?? '')
    setDescription(asset?.description ?? '')
    setTextContent(asset?.textContent ?? '')
    setFileUrl(asset?.fileUrl ?? null)
    setFileSize(asset?.fileSize ?? null)
    setMimeType(asset?.mimeType ?? null)
    setSourceUrl(asset?.sourceUrl ?? '')
    setFolderId(asset?.folderId ?? defaultFolderId ?? NO_FOLDER)
    setVisibility(asset?.visibility ?? 'sales')
    setCodes((asset?.productCodes ?? []).join(', '))
  }, [open, asset, defaultFolderId])

  const onPickFile = (f: File | undefined) => {
    if (!f) return
    upload.mutate(f, {
      onSuccess: (r) => {
        setFileUrl(r.url)
        setKind(r.kind)
        setFileSize(r.fileSize)
        setMimeType(r.mimeType)
        // Chưa đặt tiêu đề thì lấy tên tệp làm gợi ý.
        if (!title.trim()) setTitle(r.originalName.replace(/\.[^.]+$/, ''))
        toast.success('Đã tải tệp lên')
      },
      onError: (e) => toast.error(apiError(e)),
    })
  }

  const onSave = () => {
    if (!title.trim()) { toast.error('Nhập tiêu đề cho tài nguyên'); return }
    if (!fileUrl && !sourceUrl.trim() && !textContent.trim()) {
      toast.error('Cần tải tệp, dán đường dẫn, hoặc nhập nội dung chữ')
      return
    }
    if (sourceUrl.trim() && !/^https?:\/\//i.test(sourceUrl.trim())) {
      toast.error('Đường dẫn phải bắt đầu bằng http:// hoặc https://')
      return
    }

    save.mutate(
      {
        id: asset?.id,
        data: {
          kind,
          title: title.trim(),
          description: description.trim() || null,
          textContent: textContent.trim() || null,
          fileUrl,
          fileSize,
          mimeType,
          sourceUrl: sourceUrl.trim() || null,
          folderId: folderId === NO_FOLDER ? null : folderId,
          visibility,
          productCodes: codes.split(',').map((c) => c.trim()).filter(Boolean),
        },
      },
      {
        onSuccess: () => {
          toast.success(asset ? 'Đã cập nhật tài nguyên' : 'Đã thêm tài nguyên')
          onOpenChange(false)
        },
        onError: (e) => toast.error(apiError(e)),
      },
    )
  }

  const preview = assetUrl(fileUrl)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b px-5 py-3">
          <DialogTitle className="text-base">{asset ? 'Sửa tài nguyên' : 'Thêm tài nguyên'}</DialogTitle>
          <DialogDescription>
            Tải tệp lên, dán đường dẫn, hoặc gõ văn bản. Gắn mã sản phẩm để AI và nhân viên tìm được.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/* Nguồn nội dung */}
          <div className="grid gap-1.5">
            <Label>Tệp</Label>
            <input
              ref={fileRef} type="file" className="hidden"
              accept=".jpg,.jpeg,.png,.webp,.gif,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv,.mp4,.webm"
              onChange={(e) => { onPickFile(e.target.files?.[0]); e.target.value = '' }}
            />
            {fileUrl ? (
              <div className="flex items-center gap-2 rounded-md border p-2">
                {preview && kind === 'image' && <img src={preview} alt="" className="h-12 w-12 rounded object-cover" />}
                <span className="min-w-0 flex-1 truncate text-xs">{fileUrl.split('/').pop()}</span>
                <button
                  type="button" aria-label="Gỡ tệp"
                  onClick={() => { setFileUrl(null); setFileSize(null); setMimeType(null) }}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <Button type="button" variant="outline" className="gap-1.5" onClick={() => fileRef.current?.click()} disabled={upload.isPending}>
                {upload.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Tải tệp lên (tối đa 25MB)
              </Button>
            )}
            <p className="text-[11px] text-muted-foreground">
              Video nặng nên dán đường dẫn thay vì tải lên, đỡ tốn ổ đĩa máy chủ.
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label>Hoặc đường dẫn ngoài</Label>
            <Input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://drive.google.com/… hoặc link YouTube" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Loại</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as AssetKind)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(KIND_LABELS) as AssetKind[]).map((k) => (
                    <SelectItem key={k} value={k}>{KIND_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Thư mục</Label>
              <Select value={folderId} onValueChange={setFolderId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_FOLDER}>Chưa xếp thư mục</SelectItem>
                  {folders.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.icon ? `${f.icon} ` : ''}{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Tiêu đề *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="VD: Biểu giá 2026, Ảnh Vạn Hỷ Trà 100g…" />
          </div>

          <div className="grid gap-1.5">
            <Label>Mô tả ngắn</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Dùng khi nào, gửi cho ai…" />
          </div>

          <div className="grid gap-1.5">
            <Label>Nội dung chữ (AI đọc phần này)</Label>
            <Textarea
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              rows={4}
              placeholder="Với tài liệu chữ: dán nội dung vào đây để AI tra cứu được. Ảnh/video thì để trống."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Mã sản phẩm áp dụng</Label>
              <Input value={codes} onChange={(e) => setCodes(e.target.value)} placeholder="VT-200G, CC03-100" />
              <p className="text-[11px] text-muted-foreground">Cách nhau bởi dấu phẩy. Để trống = tài nguyên chung.</p>
            </div>
            <div className="grid gap-1.5">
              <Label>Mức hiển thị</Label>
              <Select value={visibility} onValueChange={(v) => setVisibility(v as Visibility)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(VISIBILITY_LABELS) as Visibility[]).map((v) => (
                    <SelectItem key={v} value={v}>{VISIBILITY_LABELS[v]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">"Chỉ nội bộ" sẽ không lọt vào lời AI tư vấn.</p>
            </div>
          </div>
        </div>

        <DialogFooter className="border-t px-5 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>Huỷ</Button>
          <Button onClick={onSave} disabled={save.isPending || upload.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
