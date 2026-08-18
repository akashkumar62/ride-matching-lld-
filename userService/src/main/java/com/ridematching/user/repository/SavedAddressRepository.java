package com.ridematching.user.repository;

import com.ridematching.user.entity.SavedAddress;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SavedAddressRepository
        extends JpaRepository<SavedAddress, UUID> {

    List<SavedAddress> findByUserProfileEmail(String email);

    Optional<SavedAddress> findByIdAndUserProfileEmail(UUID id, String email);

}