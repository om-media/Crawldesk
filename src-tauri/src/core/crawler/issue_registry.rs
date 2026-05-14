//! Stable SEO issue taxonomy.
//!
//! Detectors should emit issue IDs from this registry instead of ad hoc strings.
//! The DB still stores strings for compatibility, but this module is the source
//! of truth for IDs, default severity/category, labels, and recommendations.

#![allow(dead_code)]

use super::models::{IssueCategory, IssueSeverity, SeoIssue};
use serde::Serialize;
use serde_json::{Map, Value};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum IssueType {
    MissingTitle,
    TitleTooLong,
    TitleTooShort,
    MissingMetaDescription,
    MetaDescriptionTooLong,
    MetaDescriptionTooShort,
    MissingH1,
    MultipleH1,
    MissingH2,
    HeadingNonSequential,
    Noindex,
    ImportantPageNoindex,
    Non200Status,
    SlowResponse,
    MissingCanonical,
    NonSelfReferencingCanonical,
    NoCanonicalTag,
    ExternalCanonical,
    CanonicalizedUrl,
    DuplicateTitle,
    DuplicateMetaDescription,
    DuplicateContent,
    RedirectChain,
    CanonicalCluster,
    HreflangDuplicateLang,
    HreflangInvalidCode,
    HreflangMissingReciprocal,
    HreflangInvalidTarget,
    ImageMissingAltAttribute,
    ImagesWithoutAlt,
    ImageOversized,
    ImageMissingDimensions,
    MissingStructuredData,
    StructuredDataMissingFields,
    ProductMissingPrice,
    ArticleMissingAuthor,
    BreadcrumbInvalid,
    AmpMissingCanonical,
    AmpInvalidTarget,
    MissingSecurityHeader,
    MissingHsts,
    MissingCsp,
    MissingXContentTypeOptions,
    MissingXFrameOptions,
    MissingReferrerPolicy,
    MixedContent,
    InsecureHttp,
    MissingOgTags,
    OgMissingImage,
    MissingTwitterCard,
    TwitterMissingImage,
    OrphanedPage,
    AnchorTextOverOptimized,
    InternalLinkTo4xx,
    BrokenPaginationChain,
    MissingPaginationCanonical,
    SitemapUrlNotCrawled,
    CrawledUrlMissingFromSitemap,
    SitemapUrlErrorStatus,
}

#[derive(Debug, Clone)]
pub struct IssueDefinition {
    pub issue_type: IssueType,
    pub id: &'static str,
    pub label: &'static str,
    pub severity: IssueSeverity,
    pub category: IssueCategory,
    pub explanation: &'static str,
    pub recommendation: &'static str,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueDefinitionDto {
    pub id: &'static str,
    pub label: &'static str,
    pub severity: IssueSeverity,
    pub category: IssueCategory,
    pub explanation: &'static str,
    pub recommendation: &'static str,
}

impl From<IssueDefinition> for IssueDefinitionDto {
    fn from(definition: IssueDefinition) -> Self {
        Self {
            id: definition.id,
            label: definition.label,
            severity: definition.severity,
            category: definition.category,
            explanation: definition.explanation,
            recommendation: definition.recommendation,
        }
    }
}

pub const ALL_ISSUE_TYPES: &[IssueType] = &[
    IssueType::MissingTitle,
    IssueType::TitleTooLong,
    IssueType::TitleTooShort,
    IssueType::MissingMetaDescription,
    IssueType::MetaDescriptionTooLong,
    IssueType::MetaDescriptionTooShort,
    IssueType::MissingH1,
    IssueType::MultipleH1,
    IssueType::MissingH2,
    IssueType::HeadingNonSequential,
    IssueType::Noindex,
    IssueType::ImportantPageNoindex,
    IssueType::Non200Status,
    IssueType::SlowResponse,
    IssueType::MissingCanonical,
    IssueType::NonSelfReferencingCanonical,
    IssueType::NoCanonicalTag,
    IssueType::ExternalCanonical,
    IssueType::CanonicalizedUrl,
    IssueType::DuplicateTitle,
    IssueType::DuplicateMetaDescription,
    IssueType::DuplicateContent,
    IssueType::RedirectChain,
    IssueType::CanonicalCluster,
    IssueType::HreflangDuplicateLang,
    IssueType::HreflangInvalidCode,
    IssueType::HreflangMissingReciprocal,
    IssueType::HreflangInvalidTarget,
    IssueType::ImageMissingAltAttribute,
    IssueType::ImagesWithoutAlt,
    IssueType::ImageOversized,
    IssueType::ImageMissingDimensions,
    IssueType::MissingStructuredData,
    IssueType::StructuredDataMissingFields,
    IssueType::ProductMissingPrice,
    IssueType::ArticleMissingAuthor,
    IssueType::BreadcrumbInvalid,
    IssueType::AmpMissingCanonical,
    IssueType::AmpInvalidTarget,
    IssueType::MissingSecurityHeader,
    IssueType::MissingHsts,
    IssueType::MissingCsp,
    IssueType::MissingXContentTypeOptions,
    IssueType::MissingXFrameOptions,
    IssueType::MissingReferrerPolicy,
    IssueType::MixedContent,
    IssueType::InsecureHttp,
    IssueType::MissingOgTags,
    IssueType::OgMissingImage,
    IssueType::MissingTwitterCard,
    IssueType::TwitterMissingImage,
    IssueType::OrphanedPage,
    IssueType::AnchorTextOverOptimized,
    IssueType::InternalLinkTo4xx,
    IssueType::BrokenPaginationChain,
    IssueType::MissingPaginationCanonical,
    IssueType::SitemapUrlNotCrawled,
    IssueType::CrawledUrlMissingFromSitemap,
    IssueType::SitemapUrlErrorStatus,
];

impl IssueType {
    pub fn id(self) -> &'static str {
        match self {
            IssueType::MissingTitle => "missing_title",
            IssueType::TitleTooLong => "title_too_long",
            IssueType::TitleTooShort => "title_too_short",
            IssueType::MissingMetaDescription => "missing_meta_description",
            IssueType::MetaDescriptionTooLong => "meta_description_too_long",
            IssueType::MetaDescriptionTooShort => "meta_description_too_short",
            IssueType::MissingH1 => "missing_h1",
            IssueType::MultipleH1 => "multiple_h1",
            IssueType::MissingH2 => "missing_h2",
            IssueType::HeadingNonSequential => "heading_non_sequential",
            IssueType::Noindex => "noindex",
            IssueType::ImportantPageNoindex => "important_page_noindex",
            IssueType::Non200Status => "non_200_status",
            IssueType::SlowResponse => "slow_response",
            IssueType::MissingCanonical => "missing_canonical",
            IssueType::NonSelfReferencingCanonical => "non_self_referencing_canonical",
            IssueType::NoCanonicalTag => "no_canonical_tag",
            IssueType::ExternalCanonical => "external_canonical",
            IssueType::CanonicalizedUrl => "canonicalized_url",
            IssueType::DuplicateTitle => "duplicate_title",
            IssueType::DuplicateMetaDescription => "duplicate_meta_description",
            IssueType::DuplicateContent => "duplicate_content",
            IssueType::RedirectChain => "redirect_chain",
            IssueType::CanonicalCluster => "canonical_cluster",
            IssueType::HreflangDuplicateLang => "hreflang_duplicate_lang",
            IssueType::HreflangInvalidCode => "hreflang_invalid_code",
            IssueType::HreflangMissingReciprocal => "hreflang_missing_reciprocal",
            IssueType::HreflangInvalidTarget => "hreflang_invalid_target",
            IssueType::ImageMissingAltAttribute => "image_missing_alt_attribute",
            IssueType::ImagesWithoutAlt => "images_without_alt",
            IssueType::ImageOversized => "image_oversized",
            IssueType::ImageMissingDimensions => "image_missing_dimensions",
            IssueType::MissingStructuredData => "missing_structured_data",
            IssueType::StructuredDataMissingFields => "structured_data_missing_fields",
            IssueType::ProductMissingPrice => "product_missing_price",
            IssueType::ArticleMissingAuthor => "article_missing_author",
            IssueType::BreadcrumbInvalid => "breadcrumb_invalid",
            IssueType::AmpMissingCanonical => "amp_missing_canonical",
            IssueType::AmpInvalidTarget => "amp_invalid_target",
            IssueType::MissingSecurityHeader => "missing_security_header",
            IssueType::MissingHsts => "missing_hsts",
            IssueType::MissingCsp => "missing_csp",
            IssueType::MissingXContentTypeOptions => "missing_x_content_type_options",
            IssueType::MissingXFrameOptions => "missing_x_frame_options",
            IssueType::MissingReferrerPolicy => "missing_referrer_policy",
            IssueType::MixedContent => "mixed_content",
            IssueType::InsecureHttp => "insecure_http",
            IssueType::MissingOgTags => "missing_og_tags",
            IssueType::OgMissingImage => "og_missing_image",
            IssueType::MissingTwitterCard => "missing_twitter_card",
            IssueType::TwitterMissingImage => "twitter_missing_image",
            IssueType::OrphanedPage => "orphaned_page",
            IssueType::AnchorTextOverOptimized => "anchor_text_over_optimized",
            IssueType::InternalLinkTo4xx => "internal_link_to_4xx",
            IssueType::BrokenPaginationChain => "broken_pagination_chain",
            IssueType::MissingPaginationCanonical => "missing_pagination_canonical",
            IssueType::SitemapUrlNotCrawled => "sitemap_url_not_crawled",
            IssueType::CrawledUrlMissingFromSitemap => "crawled_url_missing_from_sitemap",
            IssueType::SitemapUrlErrorStatus => "sitemap_url_error_status",
        }
    }

    pub fn definition(self) -> IssueDefinition {
        let (label, severity, category, explanation, recommendation) = match self {
            IssueType::MissingTitle => (
                "Missing title",
                IssueSeverity::Critical,
                IssueCategory::Content,
                "The page has no title tag or the title is empty.",
                "Add a descriptive, unique title tag.",
            ),
            IssueType::TitleTooLong => (
                "Title too long",
                IssueSeverity::Warning,
                IssueCategory::Content,
                "The title may be truncated in search results.",
                "Keep title text close to 50-60 characters.",
            ),
            IssueType::TitleTooShort => (
                "Title too short",
                IssueSeverity::Info,
                IssueCategory::Content,
                "The title may not provide enough search result context.",
                "Expand the title with descriptive page-specific terms.",
            ),
            IssueType::MissingMetaDescription => (
                "Missing meta description",
                IssueSeverity::Warning,
                IssueCategory::Content,
                "The page has no meta description.",
                "Add a concise meta description of roughly 120-155 characters.",
            ),
            IssueType::MetaDescriptionTooLong => (
                "Meta description too long",
                IssueSeverity::Info,
                IssueCategory::Content,
                "The meta description may be truncated in search results.",
                "Shorten the description to the most useful summary.",
            ),
            IssueType::MetaDescriptionTooShort => (
                "Meta description too short",
                IssueSeverity::Info,
                IssueCategory::Content,
                "The meta description may not give enough search result context.",
                "Expand the description with a useful page summary.",
            ),
            IssueType::MissingH1 => (
                "Missing H1",
                IssueSeverity::Critical,
                IssueCategory::Structure,
                "The page has no H1 heading.",
                "Add one descriptive H1 that summarizes the page.",
            ),
            IssueType::MultipleH1 => (
                "Multiple H1 headings",
                IssueSeverity::Warning,
                IssueCategory::Structure,
                "The page has more than one H1 heading.",
                "Use one H1 and demote secondary headings.",
            ),
            IssueType::MissingH2 => (
                "Missing H2",
                IssueSeverity::Info,
                IssueCategory::Structure,
                "The page lacks H2 section headings.",
                "Add H2 headings to structure meaningful sections.",
            ),
            IssueType::HeadingNonSequential => (
                "Non-sequential headings",
                IssueSeverity::Warning,
                IssueCategory::Structure,
                "The heading hierarchy skips levels.",
                "Use sequential heading levels for accessibility and structure.",
            ),
            IssueType::Noindex | IssueType::ImportantPageNoindex => (
                "Noindex page",
                IssueSeverity::Critical,
                IssueCategory::Technical,
                "The page is excluded from search engine indexes.",
                "Remove noindex if the page should rank.",
            ),
            IssueType::Non200Status => (
                "Non-200 status",
                IssueSeverity::Warning,
                IssueCategory::Technical,
                "The page returned an error or non-success HTTP status.",
                "Fix the response status or remove internal links to the URL.",
            ),
            IssueType::SlowResponse => (
                "Slow response",
                IssueSeverity::Warning,
                IssueCategory::Performance,
                "The page response exceeded the configured speed threshold.",
                "Investigate server, caching, and page delivery performance.",
            ),
            IssueType::MissingCanonical | IssueType::NoCanonicalTag => (
                "Missing canonical",
                IssueSeverity::Warning,
                IssueCategory::Technical,
                "The page has no canonical link element.",
                "Add a self-referencing canonical where appropriate.",
            ),
            IssueType::NonSelfReferencingCanonical | IssueType::CanonicalizedUrl => (
                "Canonical points elsewhere",
                IssueSeverity::Info,
                IssueCategory::Technical,
                "The canonical target differs from the current page URL.",
                "Confirm the canonical target is intentional.",
            ),
            IssueType::ExternalCanonical => (
                "External canonical",
                IssueSeverity::Critical,
                IssueCategory::Technical,
                "The canonical target is on another domain.",
                "Verify the external canonical is intentional.",
            ),
            IssueType::DuplicateTitle => (
                "Duplicate title",
                IssueSeverity::Warning,
                IssueCategory::Content,
                "Multiple pages share the same title.",
                "Give each indexable page a unique title.",
            ),
            IssueType::DuplicateMetaDescription => (
                "Duplicate meta description",
                IssueSeverity::Warning,
                IssueCategory::Content,
                "Multiple pages share the same meta description.",
                "Write unique descriptions for important pages.",
            ),
            IssueType::DuplicateContent => (
                "Duplicate content",
                IssueSeverity::Warning,
                IssueCategory::Content,
                "Multiple pages appear to have the same content.",
                "Canonicalize, consolidate, or differentiate duplicate pages.",
            ),
            IssueType::RedirectChain => (
                "Redirect chain",
                IssueSeverity::Warning,
                IssueCategory::Technical,
                "The URL redirects through multiple hops.",
                "Link directly to the final destination where possible.",
            ),
            IssueType::CanonicalCluster => (
                "Canonical cluster",
                IssueSeverity::Info,
                IssueCategory::Technical,
                "Multiple pages canonicalize to the same target.",
                "Review whether the cluster is intentional.",
            ),
            IssueType::HreflangDuplicateLang
            | IssueType::HreflangInvalidCode
            | IssueType::HreflangMissingReciprocal
            | IssueType::HreflangInvalidTarget => (
                "Hreflang issue",
                IssueSeverity::Warning,
                IssueCategory::Internationalization,
                "The page has an invalid or incomplete hreflang setup.",
                "Fix hreflang language codes, targets, and reciprocal links.",
            ),
            IssueType::ImageMissingAltAttribute | IssueType::ImagesWithoutAlt => (
                "Image missing alt text",
                IssueSeverity::Warning,
                IssueCategory::Content,
                "One or more images are missing alt text.",
                "Add useful alt text for informative images.",
            ),
            IssueType::ImageOversized => (
                "Oversized image",
                IssueSeverity::Warning,
                IssueCategory::Performance,
                "An image is larger than needed for the page.",
                "Resize, compress, or serve responsive image variants.",
            ),
            IssueType::ImageMissingDimensions => (
                "Image missing dimensions",
                IssueSeverity::Info,
                IssueCategory::Performance,
                "An image lacks explicit dimensions.",
                "Set width and height to reduce layout shift.",
            ),
            IssueType::MissingStructuredData
            | IssueType::StructuredDataMissingFields
            | IssueType::ProductMissingPrice
            | IssueType::ArticleMissingAuthor
            | IssueType::BreadcrumbInvalid => (
                "Structured data issue",
                IssueSeverity::Warning,
                IssueCategory::Technical,
                "Structured data is missing or incomplete.",
                "Add required fields for the schema type.",
            ),
            IssueType::AmpMissingCanonical | IssueType::AmpInvalidTarget => (
                "AMP issue",
                IssueSeverity::Warning,
                IssueCategory::Technical,
                "The AMP setup is incomplete or points to an invalid target.",
                "Validate AMP references and canonical relationships.",
            ),
            IssueType::MissingSecurityHeader
            | IssueType::MissingXContentTypeOptions
            | IssueType::MissingXFrameOptions
            | IssueType::MissingReferrerPolicy => (
                "Security header issue",
                IssueSeverity::Warning,
                IssueCategory::Security,
                "A recommended security header is missing.",
                "Add the missing security header if compatible with the site.",
            ),
            IssueType::MissingHsts => (
                "Missing HSTS",
                IssueSeverity::Warning,
                IssueCategory::Security,
                "The HTTPS page does not send a Strict-Transport-Security header.",
                "Add Strict-Transport-Security after confirming the whole hostname is HTTPS-ready.",
            ),
            IssueType::MissingCsp => (
                "Missing CSP",
                IssueSeverity::Warning,
                IssueCategory::Security,
                "The page does not send a Content-Security-Policy header.",
                "Add a Content-Security-Policy tuned to the site's required scripts, styles, frames, and media.",
            ),
            IssueType::MixedContent => (
                "Mixed content",
                IssueSeverity::Critical,
                IssueCategory::Security,
                "An HTTPS page references insecure HTTP resources.",
                "Load all page resources over HTTPS or remove insecure resource references.",
            ),
            IssueType::InsecureHttp => (
                "Insecure HTTP page",
                IssueSeverity::Critical,
                IssueCategory::Security,
                "The page was crawled over HTTP instead of HTTPS.",
                "Serve the page over HTTPS and redirect the HTTP URL to its HTTPS equivalent.",
            ),
            IssueType::MissingOgTags
            | IssueType::OgMissingImage
            | IssueType::MissingTwitterCard
            | IssueType::TwitterMissingImage => (
                "Social metadata issue",
                IssueSeverity::Info,
                IssueCategory::Social,
                "The page has incomplete social sharing metadata.",
                "Add complete Open Graph and Twitter Card tags.",
            ),
            IssueType::OrphanedPage => (
                "Orphaned page",
                IssueSeverity::Warning,
                IssueCategory::Links,
                "The page has no internal inlinks.",
                "Add internal links from relevant pages.",
            ),
            IssueType::AnchorTextOverOptimized => (
                "Over-optimized anchor text",
                IssueSeverity::Info,
                IssueCategory::Links,
                "Internal anchor text is heavily repeated.",
                "Vary anchor text naturally where useful.",
            ),
            IssueType::InternalLinkTo4xx => (
                "Internal link to 4xx",
                IssueSeverity::Critical,
                IssueCategory::Links,
                "An internal link points to a client error URL.",
                "Update or remove the broken internal link.",
            ),
            IssueType::BrokenPaginationChain | IssueType::MissingPaginationCanonical => (
                "Pagination issue",
                IssueSeverity::Warning,
                IssueCategory::Technical,
                "Pagination signals are broken or incomplete.",
                "Fix pagination links and canonical relationships.",
            ),
            IssueType::SitemapUrlNotCrawled
            | IssueType::CrawledUrlMissingFromSitemap
            | IssueType::SitemapUrlErrorStatus => (
                "Sitemap issue",
                IssueSeverity::Warning,
                IssueCategory::Technical,
                "The sitemap and crawled URLs do not fully agree.",
                "Update the sitemap so it contains only valid canonical URLs.",
            ),
        };

        IssueDefinition {
            issue_type: self,
            id: self.id(),
            label,
            severity,
            category,
            explanation,
            recommendation,
        }
    }
}

pub fn issue(issue_type: IssueType, message: impl Into<String>, details: Value) -> SeoIssue {
    let definition = issue_type.definition();
    SeoIssue {
        issue_type: definition.id.to_string(),
        severity: definition.severity,
        category: definition.category,
        message: message.into(),
        details: details_with_recommendation(details, definition.recommendation),
    }
}

pub fn issue_with(
    issue_type: IssueType,
    severity: IssueSeverity,
    category: IssueCategory,
    message: impl Into<String>,
    details: Value,
) -> SeoIssue {
    let definition = issue_type.definition();
    SeoIssue {
        issue_type: definition.id.to_string(),
        severity,
        category,
        message: message.into(),
        details: details_with_recommendation(details, definition.recommendation),
    }
}

fn details_with_recommendation(details: Value, recommendation: &'static str) -> Value {
    match details {
        Value::Object(mut object) => {
            object
                .entry("recommendation")
                .or_insert_with(|| Value::String(recommendation.to_string()));
            Value::Object(object)
        }
        Value::Null => {
            let mut object = Map::new();
            object.insert(
                "recommendation".to_string(),
                Value::String(recommendation.to_string()),
            );
            Value::Object(object)
        }
        value => {
            let mut object = Map::new();
            object.insert("value".to_string(), value);
            object.insert(
                "recommendation".to_string(),
                Value::String(recommendation.to_string()),
            );
            Value::Object(object)
        }
    }
}

pub fn definition_for_id(id: &str) -> Option<IssueDefinition> {
    ALL_ISSUE_TYPES
        .iter()
        .copied()
        .map(IssueType::definition)
        .find(|definition| definition.id == id)
}

pub fn all_definitions() -> Vec<IssueDefinitionDto> {
    ALL_ISSUE_TYPES
        .iter()
        .copied()
        .map(IssueType::definition)
        .map(IssueDefinitionDto::from)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn issue_ids_are_unique() {
        let mut ids = HashSet::new();
        for issue_type in ALL_ISSUE_TYPES {
            assert!(
                ids.insert(issue_type.id()),
                "duplicate issue id: {}",
                issue_type.id()
            );
        }
    }

    #[test]
    fn missing_title_definition_is_stable() {
        let definition = IssueType::MissingTitle.definition();
        assert_eq!(definition.id, "missing_title");
        assert_eq!(definition.severity, IssueSeverity::Critical);
        assert_eq!(definition.category, IssueCategory::Content);
    }

    #[test]
    fn builder_uses_registry_defaults() {
        let detected = issue(
            IssueType::MissingMetaDescription,
            "Missing meta description",
            serde_json::json!({"url": "https://example.com"}),
        );

        assert_eq!(detected.issue_type, "missing_meta_description");
        assert_eq!(detected.severity, IssueSeverity::Warning);
        assert_eq!(detected.category, IssueCategory::Content);
        assert_eq!(
            detected.details["recommendation"],
            "Add a concise meta description of roughly 120-155 characters."
        );
    }

    #[test]
    fn builder_can_preserve_detector_specific_overrides() {
        let detected = issue_with(
            IssueType::MissingH1,
            IssueSeverity::Warning,
            IssueCategory::Structure,
            "Missing H1",
            serde_json::json!({"url": "https://example.com"}),
        );

        assert_eq!(detected.issue_type, "missing_h1");
        assert_eq!(detected.severity, IssueSeverity::Warning);
        assert_eq!(detected.category, IssueCategory::Structure);
    }

    #[test]
    fn builder_preserves_detector_specific_recommendation() {
        let detected = issue(
            IssueType::TitleTooShort,
            "Title too short",
            serde_json::json!({
                "url": "https://example.com",
                "recommendation": "Use the product name in the title."
            }),
        );

        assert_eq!(
            detected.details["recommendation"],
            "Use the product name in the title."
        );
    }

    #[test]
    fn definition_lookup_finds_known_id() {
        let definition = definition_for_id("external_canonical").unwrap();
        assert_eq!(definition.issue_type, IssueType::ExternalCanonical);
        assert_eq!(definition.category, IssueCategory::Technical);
    }

    #[test]
    fn all_definitions_are_serializable_for_frontend() {
        let definitions = all_definitions();

        assert_eq!(definitions.len(), ALL_ISSUE_TYPES.len());
        assert!(definitions
            .iter()
            .any(|definition| definition.id == "missing_title"));
        serde_json::to_value(definitions).unwrap();
    }
}
