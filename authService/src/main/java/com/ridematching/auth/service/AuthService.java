package com.ridematching.auth.service;

import com.ridematching.auth.dto.*;
import com.ridematching.auth.entity.UserCredential;
import com.ridematching.auth.repository.UserCredentialRepository;
import com.ridematching.auth.security.JwtService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.*;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserCredentialRepository repository;
    private final PasswordEncoder encoder;
    private final JwtService jwtService;
    private final AuthenticationManager authenticationManager;

    public void register(RegisterRequest request) {

        if (repository.existsByEmail(request.email())) {
            throw new RuntimeException("Email already exists");
        }

        UserCredential user = new UserCredential();

        user.setEmail(request.email());
        user.setPassword(encoder.encode(request.password()));
        user.setRole(request.role());

        repository.save(user);
    }

    public LoginResponse login(LoginRequest request) {

        authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(
                        request.email(),
                        request.password()));

        UserCredential user = repository.findByEmail(request.email())
                .orElseThrow(() -> new RuntimeException("User not found"));

        String token = jwtService.generateToken(user.getEmail(), user.getRole());

        return new LoginResponse(token);
    }

}