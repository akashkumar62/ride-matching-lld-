package com.ridematching.user.service;

import com.ridematching.user.dto.CreateProfileRequest;
import com.ridematching.user.dto.ProfileResponse;
import com.ridematching.user.dto.UpdateProfileRequest;
import com.ridematching.user.entity.UserProfile;
import com.ridematching.user.repository.UserProfileRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class ProfileService {

    private final UserProfileRepository repository;

    public ProfileResponse create(String email, CreateProfileRequest request) {

        if (repository.existsByEmail(email)) {
            throw new RuntimeException("Profile already exists");
        }

        UserProfile profile = new UserProfile();

        profile.setEmail(email);
        profile.setFullName(request.fullName());
        profile.setPhone(request.phone());

        repository.save(profile);

        return toResponse(profile);
    }

    public ProfileResponse getByEmail(String email) {

        UserProfile profile = repository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("Profile not found"));

        return toResponse(profile);
    }

    public ProfileResponse update(String email, UpdateProfileRequest request) {

        UserProfile profile = repository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("Profile not found"));

        profile.setFullName(request.fullName());
        profile.setPhone(request.phone());

        repository.save(profile);

        return toResponse(profile);
    }

    private ProfileResponse toResponse(UserProfile profile) {

        return new ProfileResponse(
                profile.getId(),
                profile.getEmail(),
                profile.getFullName(),
                profile.getPhone());
    }

}