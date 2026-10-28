/// Door-to-Door Skills Campaign (DD/S/001/2026 and DD/S/002/2026) Feature Module.
/// Isolated from core framework per Decision C16.
class DdCampaignConstants {
  static const String campaignId = 'dd_campaign_2026';
  static const String form001Code = 'DD/S/001/2026';
  static const String form002Code = 'DD/S/002/2026';

  // Consent stand-in per Blocker B2
  static const String defaultConsentVersion = 'consent.v0';
  static const bool isConsentDraft = true;

  static const String consentTextEn =
      '[DRAFT] I hereby give my consent for the Global Research & Survey (GRS) project '
      'to collect and process my skills, education, and employment data for national vocational training '
      'and welfare development programs under the Sri Lanka Personal Data Protection Act (PDPA).';

  static const String consentTextSi =
      '[DRAFT] ශ්‍රී ලංකා පුද්ගලික දත්ත ආරක්ෂණ පනත (PDPA) යටතේ ජාතික වෘත්තීය පුහුණු සහ සුභසාධන '
      'සංවර්ධන වැඩසටහන් සඳහා මගේ කුසලතා, අධ්‍යාපන සහ රැකියා තොරතුරු එක්රැස් කිරීමට සහ සැකසීමට මම මගේ කැමැත්ත ලබා දෙමි.';

  static const String consentTextTa =
      '[DRAFT] இலங்கை தனிநபர் தரவுப் பாதுகாப்புச் சட்டத்தின் (PDPA) கீழ் தேசிய தொழிற்பயிற்சி மற்றும் '
      'நலன்புரி மேம்பாட்டுத் திட்டங்களுக்காக எனது திறன்கள், கல்வி மற்றும் வேலைவாய்ப்புத் தகவல்களைச் சேகரித்து '
      'செயலாக்க நான் எனது முழுச் சம்மதத்தை அளிக்கிறேன்.';

  // Future Hopes Codes (§7.2, 10.12)
  static const List<String> futureHopeCodes = [
    'higher_education',
    'vocational_education',
    'entrepreneur',
    'local_job',
    'foreign_job',
  ];

  // Info Provided By Codes (§7.2, 10.13)
  static const List<String> infoProvidedByCodes = [
    'self',
    'mother',
    'father',
    'sister',
    'other',
  ];

  // Lookup categories
  static const String catEducation = 'education';
  static const String catVocationalQualification = 'vocational_qualification';
  static const String catVocationalStream = 'vocational_stream';
  static const String catJob = 'job';
  static const String catFutureHope = 'future_hope';
  static const String catInfoProvidedBy = 'info_provided_by';
}
