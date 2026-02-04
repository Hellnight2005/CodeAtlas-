export const GQL_ENDPOINT = "https://gql.hashnode.com";

const PUBLICATION_HOST = "projectlog.hashnode.dev";

export interface BlogPost {
  title: string;
  brief: string;
  slug: string;
  publishedAt: string;
  url: string;
  coverImage?: {
    url: string;
  };
}

const SERIES_QUERY = `
  query GetSeries($host: String!, $slug: String!) {
    publication(host: $host) {
      series(slug: $slug) {
        posts(first: 20) {
          edges {
            node {
              title
              brief
              slug
              publishedAt
              url
              coverImage {
                url
              }
            }
          }
        }
      }
    }
  }
`;

export async function getHashnodeSeries(seriesSlug = "code-atlas"): Promise<BlogPost[]> {
  try {
    const res = await fetch(GQL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: SERIES_QUERY,
        variables: {
          host: PUBLICATION_HOST,
          slug: seriesSlug
        },
      }),
      next: { revalidate: 3600 },
    });

    const data = await res.json();

    if (!data.data?.publication?.series?.posts?.edges) {
      console.error("Failed to fetch series posts:", data);
      return [];
    }

    return data.data.publication.series.posts.edges.map((edge: any) => edge.node);
  } catch (error) {
    console.error("Error fetching Hashnode series:", error);
    return [];
  }
}
