from django.contrib.auth import get_user_model

User = get_user_model()


class OrganizationMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        org = None
        if request.user.is_authenticated:
            try:
                org = request.user.profile.organization
            except (AttributeError, User.profile.RelatedObjectDoesNotExist):
                pass
        request.organization = org
        return self.get_response(request)
