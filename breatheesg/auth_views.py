from django.contrib.auth import authenticate, login as django_login, logout as django_logout
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response


@api_view(['GET'])
@permission_classes([AllowAny])
@ensure_csrf_cookie
def csrf_token(request):
    return Response({'detail': 'CSRF cookie set'})


@api_view(['POST'])
@permission_classes([AllowAny])
def login(request):
    username = request.data.get('username', '')
    password = request.data.get('password', '')
    user = authenticate(username=username, password=password)
    if user:
        django_login(request, user)
        return Response({
            'user': {
                'id': user.id,
                'username': user.username,
                'email': user.email or '',
                'is_staff': user.is_staff,
            },
        })
    return Response({'error': 'Invalid credentials'}, status=400)


@api_view(['GET'])
def me(request):
    user = request.user
    return Response({
        'id': user.id,
        'username': user.username,
        'email': user.email or '',
        'is_staff': user.is_staff,
    })


@api_view(['POST'])
def logout(request):
    django_logout(request)
    return Response({'detail': 'Logged out'})
