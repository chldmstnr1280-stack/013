import { Flash, flash, PageHeader, type SP } from "@/components/ui";
import { ProductForm } from "@/components/product-form";

export default async function NewProduct({ searchParams }: { searchParams: SP }) {
  const { msg, err } = await flash(searchParams);
  return (
    <>
      <PageHeader title="상품 등록" desc="쿠팡 상품 상세 페이지에서 직접 확인한 정보만 입력하세요. 자동 수집(크롤링)은 지원하지 않습니다." />
      <Flash msg={msg} err={err} />
      <ProductForm />
    </>
  );
}
