import { useEffect } from 'react';

/** Give every route a unique, descriptive <title> (WCAG 2.4.2 Page Titled). */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} | PixelFlow` : 'PixelFlow';
  }, [title]);
}

export default useDocumentTitle;
