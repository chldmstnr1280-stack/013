import { saveProduct } from "@/app/actions";
import { Submit } from "@/components/submit";
import { IMAGE_RIGHTS_LABEL, type ImageRights, type Product } from "@/lib/types";

export function ProductForm({ p }: { p?: Product }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form action={saveProduct} className="card grid gap-4 sm:grid-cols-2">
      {p && <input type="hidden" name="id" value={p.id} />}
      <div className="sm:col-span-2">
        <label className="label" htmlFor="name">상품명 *</label>
        <input id="name" name="name" required defaultValue={p?.name} className="input" />
      </div>
      <div>
        <label className="label" htmlFor="category">카테고리</label>
        <input id="category" name="category" defaultValue={p?.category} className="input" placeholder="예: 주방용품" />
      </div>
      <div>
        <label className="label" htmlFor="price">확인된 가격 (원)</label>
        <input id="price" name="price" inputMode="numeric" defaultValue={p?.price ?? ""} className="input" placeholder="모르면 비워 두세요 — AI가 가격을 언급하지 않습니다" />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="features">상품 특징 (한 줄에 하나, 상세 페이지에서 확인한 사실만)</label>
        <textarea id="features" name="features" rows={5} defaultValue={p?.features.join("\n")} className="input" placeholder={"접으면 높이 2cm\n전자레인지 사용 가능(뚜껑 제외)"} />
      </div>
      <div>
        <label className="label" htmlFor="coupang_url">쿠팡 상품 URL</label>
        <input id="coupang_url" name="coupang_url" type="url" defaultValue={p?.coupang_url} className="input" placeholder="https://www.coupang.com/vp/products/..." />
      </div>
      <div>
        <label className="label" htmlFor="affiliate_url">쿠팡 파트너스 제휴 링크</label>
        <input id="affiliate_url" name="affiliate_url" type="url" defaultValue={p?.affiliate_url} className="input" placeholder="https://link.coupang.com/a/..." />
      </div>
      <div>
        <label className="label" htmlFor="image_url">상품 이미지 URL (공개 https)</label>
        <input id="image_url" name="image_url" type="url" defaultValue={p?.image_url ?? ""} className="input" />
      </div>
      <div>
        <label className="label" htmlFor="image_rights">이미지 사용 권한</label>
        <select id="image_rights" name="image_rights" defaultValue={p?.image_rights ?? "unknown"} className="input">
          {(Object.keys(IMAGE_RIGHTS_LABEL) as ImageRights[]).map((k) => (
            <option key={k} value={k}>{IMAGE_RIGHTS_LABEL[k]}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="info_verified_at">상품 정보 확인일</label>
        <input id="info_verified_at" name="info_verified_at" type="date" defaultValue={p?.info_verified_at ?? today} className="input" />
      </div>
      <div>
        <label className="label" htmlFor="notes">메모 (AI 참고용, 사실만)</label>
        <input id="notes" name="notes" defaultValue={p?.notes} className="input" />
      </div>
      <div className="sm:col-span-2 flex justify-end">
        <Submit>{p ? "저장" : "상품 등록"}</Submit>
      </div>
    </form>
  );
}
