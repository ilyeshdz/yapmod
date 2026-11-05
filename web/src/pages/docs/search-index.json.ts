import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { areaMeta, docUrl, plainText } from "../../lib/docs";

export const prerender = true;

/**
 * A small JSON index of the documentation, used by the client side search.
 */
export const GET: APIRoute = async () => {
  const docs = await getCollection("docs");

  const index = docs.map((doc) => ({
    title: doc.data.title,
    group: doc.data.area ? areaMeta[doc.data.area].label : doc.data.group,
    description: doc.data.description ?? "",
    url: docUrl(doc.id),
    text: plainText(doc.body),
  }));

  return new Response(JSON.stringify(index), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
};
